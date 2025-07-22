const Interrogator = require('./interrogator');
const fs = require('node:fs/promises');
const Entry = require('../Entry');

class Enforcer {

  cache;
  #foreign; // object → {enabled: true, cache: [], get: () => {}, set: () => {}}

  #overrides
  #caching;
  #fallback;
  #ttl;

  #CCINT;
  #activated;
  #ttl_subroutine;

  constructor(options = {}) {
    const {caching = null, fallback = null, ttl = null, cache = null, foreign = null, overrides = null} = options;

    this.cache = cache; // must point to main cache from parent


    if (overrides) this.#overrides = overrides;
    if (caching) this.#caching = caching;
    if (fallback) this.#fallback = fallback;
    if (ttl) this.#ttl = ttl;

    if (foreign) {
      this.#foreign.enabled = foreign.enabled ? foreign.enabled : true,
      this.#foreign.cache = foreign.enabled ? [] : null,
      this.#foreign.set = async (entry, data) => {
        try {
          this.#foreign.cache.push(entry);
          await foreign.set(entry, data);
          return null;
        } catch (error) {
          console.error(error);
          return error;
        }
      }
      this.#foreign.get = async (entry) => {
        try {
          const data = await foreign.get(entry);
          return data;
        } catch (error) {
          console.error(error);
          return error;
        }
      }
    }

    this.#CCINT = new Interrogator({caching, fallback});
  }

  /**
   * Starts TTL invalidation subroutine on the interval that has been defined in configuration.
   */
  init_ttl() {
    this.#ttl_subroutine = setInterval(() => {
      for (const entry in this.cache) {
        if (
          this.cache[entry].expires_at <= Date.now() ||
          this.cache[entry].expires_at_max <= Date.now()
        ) this.invalidate();
      }
    }, interval)
  }

  /**
   * Clears TTL invalidation subroutine when this function is called.
   */
  clear_ttl(){
    clearInterval(this.#ttl_subroutine);
  }

  async invalidate(entry) {
    try {
      await this.#invalidate_nvm(entry);
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  async get(entry) {
    if (this.cache[entry] && this.cache[entry].method) {
      const data = await fs.readFile(`${this.#overrides.path}/cache/${entry}.json`);
      this.cache[entry].update();
      return data;
    } else if (this.cache[entry]) {
      this.cache[entry].update();
      return this.cache[entry].data;
    } else if (this.#foreign.cache.includes(entry)) {
      const data = await this.#foreign.get(entry);

      if (data) {
        return data;
      } else {
        const index = this.#foreign.cache.indexOf(entry);
        this.#foreign.cache.splice(index, 1);
        return null;
      }

    } else {
      return null;
    }
  }

  async set(entry, data) {
    try {
      const report = await this.#CCINT.audit();
      if (report.activated) this.#activated = true;

      await this.#set_vm(entry, data);
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Attempts to invalidate an item from non-volatile memory, and its peripherals from the cache.
   * @param {*} entry - The key designating which piece of data must be removed.
   * @returns 
   */
  async #invalidate_nvm(entry) {
    try {

      if (this.cache[entry].method) {
        await fs.rm(`${this.#overrides.path}/cache/${entry}.json`, {recursive: true, force: true});
      }

      await this.#invalidate_vm(entry);

    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Attempts to invalidate an item from volatile memory. It calls the Interrogator architecture to
   * free any bytes that were associated with the entry's occupation of volatile memory.
   * @param {*} entry - The key designating which piece of data must be removed.
   * @returns 
   */
  async #invalidate_vm(entry) {
    try {
      await this.#CCINT.free(this.cache[entry].bytes);
      delete this.cache[entry];
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * If the fallback protocol has not been activated, this sends callback functions, an entry, and its
   * data to the Interrogator architecture. The Interrogator will respond will advise the Enforcer as to
   * whether this item should be cached in VM or NVM. If an underflow is detected, and underflow is enabled, 
   * the Interrogator will automatically invalidate the entry on behalf of the Enforcer.
   * @param {*} entry - The key under which a new Entry() should be instanced.
   * @param {*} data - The data to store in either VM / NVM.
   */
  async #set_vm(entry, data) {
    
    // if fallback protocol has not been activated
    if (!this.#activated) {

      // Options package to enable the Interrogator to perform its duties.
      const options = {
        cache: () => { 
          this.cache[entry] = new Entry({
          data, ttl: {
            enabled: this.#ttl.enabled,
            max: this.#ttl.max,
            min: this.#ttl.min,
            extend_by: this.#ttl.extend_by,
          }
        })},
        invalidate: () => { 
          delete this.cache[entry] 
        },
        enforce_limits: this.enforce_limits
      }

      const result = await this.#CCINT.interrogate(options);

      // if result returned bytes, we update bytes and just keep in VM
      if (result.bytes) this.cache[item].bytes = result.bytes;

      // if result returned true, overflow has occurred and we must write to NVM
      if (result === true && this.#caching.overflow) {
        await this.#set_nvm(entry, data, 'overflow');
      }

      // if result returned false, implied else do nothing because underflow
    
    // if fallback protocol has been activated
    } else {
      this.#set_nvm(entry, data, 'fallback');
    }
  }

  /**
   * Attempts to create a new Entry() according to the method ('fallback' or 'overflow') defined. If
   * a foreign has been enabled, then the contents will be offloaded to a foreign management system
   * that has been defined by the end-user. Otherwise, the data is written to a JSON in NVM.
   * @param {*} entry 
   * @param {*} data 
   * @param {*} method 
   * @returns 
   */
  async #set_nvm(entry, data, method) {
    try {

      if (this.#foreign.enabled) {
        await this.#foreign.set(entry, data);
        this.#foreign.cache.push(entry);
      } else {
        await fs.writeFile(`${this.#overrides.path}/cache/${entry}.json`, data);
        this.cache[entry] = new Entry({
          method,
          ttl: this.#ttl
        })
      }

    } catch (error) {
      console.error(error);
      return error;
    }
  }

  async enforce_limits(){
    if (this.#caching.limit.enabled) {

      // get the current size of our cache
      const current_size = Object.keys(this.cache).length;

      // if the current size exceeds the caching limit
      if (current_size >= this.#caching.limit.max) {

        // get the protocol that we will use for culling
        const protocol = this.#caching.constraints.limit.protocol;

        let cull = {};            // instance a cull baseline protocol
        let target_key;           // save the key that we need to cull
        let satisfies_conditions; // retain a conditions callback

        /**
         * Switch receives a protocol, and determines what conditional must be used for culling.
         * Additionally, determines what the cull baseline should contain.
         */
        switch(protocol) {
          case 'engagement':
            cull[protocol] = 9999999999999;
            satisfies_conditions = (curr, accum) => (curr <= accum)
            break;
          default:
            cull[protocol] = Date.now();
            satisfies_conditions = (curr, accum) => (curr <= accum)
            break;
        }

        // Apply the limit protocol and enforce limits
        for (const key in this.cache) {
          if (satisfies_conditions(this.cache[key][protocol], cull[protocol])) {
            cull = this.cache[key][protocol];
            target_key = key;
          }
        }

        this.invalidate(key);
        this.enforce_limits(); // call again, in the event that the removal of one was not enough to maintain limit
      }
    }
  }

}

module.exports = Enforcer;