const Interrogator = require('./interrogator');
const fs = require('node:fs/promises');
const Entry = require('../Entry');

/**
 * Instances a new Enforcer. The Enforcer architecture is the executor of ChimeraCache; it houses the Cache
 * and controls what data may enter or exit. The Enforcer is assisted by the Interrogator and Oracle architectures
 * to make informed decisions regarding caching constraint violations, the enforcement of fallback protocols, and
 * system performance. In addition to housing the Cache, the Enforcer maintains a TTL invalidation subroutine if
 * this setting is enabled.
 */
class Enforcer {

  cache;
  #foreign;

  #overrides
  #caching;
  #fallback;
  #ttl;

  #CCINT;
  #activated;
  #ttl_subroutine;

  constructor(options = {}) {
    const {caching = null, fallback = null, ttl = null, cache = null, foreign = null, overrides = null} = options;

    this.cache = {};

    if (overrides) this.#overrides = overrides;
    if (caching) this.#caching = caching;
    if (fallback) this.#fallback = fallback;
    if (ttl) this.#ttl = ttl;

    if (foreign && foreign.enabled) {
      this.#foreign = {};
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
    } else {
      this.#foreign = {};
      this.#foreign.enabled = false;
    }

    this.#CCINT = new Interrogator({caching: this.#caching, fallback: this.#fallback});
    this.init_ttl();
  }

  /**
   * Starts TTL invalidation subroutine on the interval that has been defined in configuration.
   */
  init_ttl() {
    if (!this.#ttl.enabled) return null;
    this.#ttl_subroutine = setInterval(() => {
      for (const entry in this.cache) {
        if (
          this.cache[entry].expires_at <= Date.now() ||
          this.cache[entry].expires_at_max <= Date.now()
        ) this.invalidate(entry);
      }
    }, this.#ttl.interval)
  }

  /**
   * Clears TTL invalidation subroutine when this function is called.
   */
  clear_ttl(){
    clearInterval(this.#ttl_subroutine);
  }

  /**
   * Invalidates (deletes) data from the Cache; does not work for a foreign cache.
   * @param {*} entry - The key designating which piece of data must be removed.
   * @returns true
   */
  async invalidate(entry) {
    try {
      await this.#invalidate_nvm(entry);
      return true;
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Attempts to retrieve data stored under the Cache entry. If the entry is found in the Cache VM, 
   * this will automatically update the entry's engagement metrics as well as when the entry was last 
   * accessed. Similar updates are performed if the entry was found to be stored in Cache NVM with the
   * only difference being that this involves JSON parsing. If 'foreign' is enabled, then attempts will
   * also be made to access foreign Cache. Finally, if no data is found, then this will return null.
   * @param {*} entry - The Cache key that data should be stored under.
   * @returns data | null
   */
  async get(entry) {
    try {
      if (this.cache[entry] && this.cache[entry].method) {
        const data = await fs.readFile(`${this.#overrides.path}/cache/storage/${entry}.json`);
        this.cache[entry].update();

        if (!this.#overrides.parsing) return data;
        return JSON.parse(data);
        
      } else if (this.cache[entry]) {
        this.cache[entry].update();
        return this.cache[entry].data;
      } else if (this.#foreign.enabled && this.#foreign.cache.includes(entry)) {
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
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Creates a new Cache entry in either VM or NVM. If the entry passes all caching constraints, and the
   * fallback protocol is not currently activated, then the entry will be stored in VM. If overflow is enabled
   * and detected, then the new entry will be stored in NVM. If overflow is disabled, but caching constraints have
   * detected a violation, then the item will not be cached. An underflow is never cached under any circumstances. 
   * If the fallback protocol has been activated, all set() attempts will default to NVM until ChimeraCache detects
   * a system recovery.
   * has been activated, then the item will be cached in NVM.
   * @param {*} entry - The key under which a new Entry() should be instanced.
   * @param {*} data - The data to store in either VM / NVM.
   * @param {*} options - Optional TTL overrides object, if you wish for this particular entry to have a different TTL.
   * @returns 
   */
  async set(entry, data, options = {}) {
    try {

      // If it already exists, don't attempt to set it again. Developer should use invalidate() if they want to set() again.
      if (this.cache[entry]) {
        return null;
      }

      const report = await this.#CCINT.audit();
      if (report.activated) this.#activated = true;
      await this.#set_vm(entry, data, options);
      return true;
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
        await fs.rm(`${this.#overrides.path}/cache/storage/${entry}.json`, {recursive: true, force: true});
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
   * @param {*} options - Optional TTL overrides object, if you wish for this particular entry to have a different TTL.
   */
  async #set_vm(entry, data, options = {}) {
    try {
      // if fallback protocol has not been activated
      if (!this.#activated) {
  
        // Options package to enable the Interrogator to perform its duties.
        const options = {
          cache: () => { 
            this.cache[entry] = new Entry({
            data, ttl: {
              enabled: this.#ttl.enabled,
              max: options.max ? options.max : this.#ttl.max,
              min: options.min ? options.min : this.#ttl.min ,
              extend_by: this.#ttl.extend_by,
            }
          })},
          invalidate: () => { 
            delete this.cache[entry] 
          },
          enforce_limits: this.enforce_limits.bind(this)
        }
  
        const result = await this.#CCINT.interrogate(options);
  
        // if result returned bytes, we update bytes and just keep in VM
        if (result.bytes) this.cache[item].bytes = result.bytes;
  
        // if result returned true, overflow has occurred and we must write to NVM
        if (result === true && this.#caching.overflow) {
          await this.#set_nvm(entry, data, 'overflow');
          return true;
        }
  
        // if result returned false, implied else do nothing because underflow
        return true;
      // if fallback protocol has been activated
      } else {
        this.#set_nvm(entry, data, options, 'fallback');
        return true;
      }

    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Attempts to create a new Entry() according to the method ('fallback' or 'overflow') defined. If
   * a foreign has been enabled, then the contents will be offloaded to a foreign management system
   * that has been defined by the end-user. Otherwise, the data is written to a JSON in NVM.
   * @param {*} entry - The key under which a new Entry() should be instanced.
   * @param {*} data - The data to store in NVM; a lightweight Entry() will be instanced in VM for the purposes of invalidation.
   * @param {*} options - Optional TTL overrides object, if you wish for this particular entry to have a different TTL.
   * @param {*} method - Used by ChimeraCache internals to describe why this item is stored in NVM rather than VM.
   * @returns 
   */
  async #set_nvm(entry, data, options = {}, method) {
    try {

      if (this.#foreign && this.#foreign.enabled) {
        await this.#foreign.set(entry, data);
        this.#foreign.cache.push(entry);
        return true;
      } else {
        await fs.writeFile(`${this.#overrides.path}/cache/storage/${entry}.json`, JSON.stringify(data));
        this.cache[entry] = new Entry({
          method: method,
          ttl: {
              enabled: this.#ttl.enabled,
              max: options.max ? options.max : this.#ttl.max,
              min: options.min ? options.min : this.#ttl.min ,
              extend_by: this.#ttl.extend_by,
          }
        })
        return true;
      }

    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Enforces a limit on the maximum amount of items allowed in the cache. If an item exceeds the
   * established limit, the declared culling protocol will be used. The Enforcer passes this down 
   * to the Interrogator architecture for use in interrogations.
   */
  async enforce_limits() {
    try {

      if (this.#caching.limit.enabled) {
  
        // get the current size of our cache
        const current_size = Object.keys(this.cache).length;
  
        // if the current size exceeds the caching limit
        if (current_size > this.#caching.limit.max) {
  
          // get the protocol that we will use for culling
          const protocol = this.#caching.limit.protocol;
  
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
  
          await this.invalidate(target_key);
          this.enforce_limits(); // call again, in the event that the removal of one was not enough to maintain limit
        }
      }
    } catch (error) {
      console.error(error);
      return error;
    }
  }

}

module.exports = Enforcer;