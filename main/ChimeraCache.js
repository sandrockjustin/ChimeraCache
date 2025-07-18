const SystemUtils = require('./SysUtils');
const CacheElement = require('./CacheElement');
const fs = require('node:fs/promises');

class ChimeraCache {

  /**
   * These are private and can NEVER be set by the end-user; for internal use only.
   */

  #ttl_subroutine = null;
  #storage = {};
  #staging = {};
  #foreign_storage = {};
  #sys = new SystemUtils();
  #fallback_activated = false;
  #fallback_cancelled = true;
  #fallback_pending = false;
  #getForeign = null;
  #setForeign = null;

  /**
   * These can be changed by the user.
   */

  #overrides = {
    ignore_defaults: false,
    export_settings: true,
    parse_caches: true,
    dirname: __dirname,
  }

  #caching = {
    overflow: true,
    constraints: {
      byte_size: {
        enabled: false,
        max: 0,
        min: 0
      },
      byte_ratio: {
        enabled: true,
        max: 0.1,
        min: 0
      },
      limit: {
        enabled: false,
        protocol: null,
        max: 0
      }
    }
  }

  #ttl = {
    enabled: true,
    interval: 300000,
    max: 600000,
    min: 300000,
    extend_by: 5000
  }

  #fallback = {
    enabled: true,
    protocol: 'flex',
    grace: 15000,
    threshold: {
      system: {
        max: 0.85,
        min: 0.7
      },
      process: {
        max: 0.85,
        min: 0.7
      }
    }
  }

  constructor(options = {}, getForeign = null, setForeign = null) {
    if (options.overrides && options.overrides.ignore_defaults) {
      this.#overrides = overrides;
      this.#caching = caching;
      this.#ttl = ttl;
      this.#fallback = fallback;
    } else {
      this.#overrides = options.overrides ? this.#merge_config(this.#overrides, options.overrides) : this.#overrides;
      this.#caching = options.caching ? this.#merge_config(this.#caching, options.caching) : this.#caching;
      this.#ttl = options.ttl ? this.#merge_config(this.#ttl, options.ttl) : this.#ttl;
      this.#fallback = options.fallback ? this.#merge_config(this.#fallback, options.fallback) : this.#fallback;   
    }

    if (getForeign || setForeign) {
      this.#getForeign = getForeign;
      this.#setForeign = setForeign;
    }
    
    this.#init();
  }

  async #init() {

    try {

      await fs.mkdir(`${this.#overrides.dirname}/ChimeraCache/caching/storage`, {recursive: true});
      await fs.mkdir(`${this.#overrides.dirname}/ChimeraCache/caching/manifests`, {recursive: true});
      await fs.mkdir(`${this.#overrides.dirname}/ChimeraCache/settings`, {recursive: true});
      await fs.mkdir(`${this.#overrides.dirname}/ChimeraCache/logs/metrics`, {recursive: true});
      await fs.mkdir(`${this.#overrides.dirname}/ChimeraCache/logs/errors`, {recursive: true});
      this.#enforce_ttl();

    } catch (error) {
      console.error(error);
    }

  }

  #merge_config(target, source) {
    for (const key in source) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        if (!target[key]) target[key] = {};
        this.#merge_config(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }


  async set(cache_key, data) {
    try {

      const key = this.sanitize(cache_key);
  
      const before = process.memoryUsage().heapUsed;
  
      this.#staging[key] = new CacheElement({
        ttl: {
          max: this.#ttl.max,
          min: this.#ttl.min
        }, 
        data: data
      });
  
      const after = process.memoryUsage().heapUsed;
      await this.#enforcer(key, before, after);
    } catch (error) {
      console.error(error);
    }

  }

  async get(cache_key) {
    try {

      const key = this.sanitize(cache_key);

      if (this.#storage[key]) {
  
        if (this.#storage[key].method) {
          
          const cache = await fs.readFile(`${this.#overrides.dirname}/ChimeraCache/storage/${key}.json`);
          this.#storage[key].update();
          return JSON.parse(cache);

        } else {

          this.#storage[key].update();
          return this.#storage[key].data;
          
        }

      } else if (this.#foreign_storage[key]) {
        
        const cache = await this.#getForeign(key);
          
        if (cache) {
          return cache;
        } else {
          delete this.#foreign_storage[key];
          return null;
        }

      } else {
        return null;
      }
    } catch (error) {
      console.error(error);
    }
  }

  sanitize(key) {
    return key.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/[\s.]+$/g, ''); 
  }

  async #invalidate(cache_key) {
    try {
      const key = this.sanitize(cache_key);
  
      // delete non-volatile caching if exists
      if (this.#storage[key].method) {
        fs.rm(`${this.#overrides.dirname}/ChimeraCache/caching/storage/${key}.json`, { recursive: true, force: true });
      }
  
      delete this.#storage[key];
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Attempts to add item to storage based on byte constraints.
   * Returns true if successful; returns false if nothing added to cache.
   */
  async #enforcer(key, before, after){
    try {

      let report = await this.#sys.report(before, after); // we check system performance
      const {byte_ratio = null, byte_size = null, limit = null} = this.#caching.constraints;

      if (limit && limit.enabled && limit.max) {
        this.#enforce_limits();
      }

      /**
       * This code block is executed if fallback is not active.
       */
      if ((byte_size && byte_size.enabled) || (byte_ratio && byte_ratio.enabled)){

        const bytes_reported = await this.#interrogate_byte_constraints(report);     // we check to see if this has any byte constraint violations, we do this first to see if we can fit in overflow

        if ((bytes_reported.overflow||this.#fallback_activated) && !(this.#getForeign || this.#setForeign)) {

          const path = `${this.#overrides.dirname}/ChimeraCache/caching/storage/${key}.json`;               

          await fs.writeFile(path, this.#staging[key].data);                      

          delete this.#staging[key];

          this.#storage[key] = new CacheElement({
            ttl: {
              min: this.#ttl.min,
              max: this.#ttl.max,
            }, 
            method: this.#fallback_activated ? 'fallback' : 'overflow'
          });                       

        } else if (bytes_reported.overflow || this.#fallback_activated) {

          this.#setForeign(key, this.#staging[key].data);
          this.#foreign_storage[key] = this.#fallback_activated ? 'fallback' : 'overflow';
          delete this.#staging[key];       

        } else if (bytes_reported.underflow) {
          delete this.#staging[key];
        }
      } else if (this.#fallback_activated && !(this.#getForeign || this.#setForeign)) {
          const path = `${this.#overrides.dirname}/ChimeraCache/caching/storage/${key}.json`;               

          await fs.writeFile(path, this.#staging[key].data);                      

          delete this.#staging[key];

          this.#storage[key] = new CacheElement({
            ttl: {
              min: this.#ttl.min,
              max: this.#ttl.max,
            }, 
            method: this.#fallback_activated ? 'fallback' : 'overflow'
          });                           
      } else if (this.#fallback_activated) {
          this.#setForeign(key, this.#staging[key].data);
          this.#foreign_storage[key] = this.#fallback_activated ? 'fallback' : 'overflow';
          delete this.#staging[key];  
      } else {
        this.#storage[key] = new CacheElement({
              ttl: {
                min: this.#ttl.min,
                max: this.#ttl.max,
              },
              data: this.#staging.data
            });
        
        delete this.#staging[key];
      }

      report = this.#sys.report();
      this.#interrogate_fallback(report);

    } catch(error) {
      console.error(error);
    }
  }

  /**
   * Gets the current size of the cache, and compares it to max limit.
   * Accounts for protocol, applies conditions, and culls one.
   */
  async #enforce_limits(){
    try {

      const current_size = Object.keys(this.#storage).length;
  
      if (current_size >= this.#caching.limit.max) {
        const protocol = this.#caching.constraints.limit.protocol;
        let cull = {};
        let target_key;
        let satisfies_conditions;

        switch(protocol) {
          case 'engagement':
            cull[protocol] = 9999999999999; // as pappy says, ain't stupid if it works (it probably still is)
            satisfies_conditions = (curr, accum) => (curr <= accum)
            break;
          default:
            cull[protocol] = Date.now();
            satisfies_conditions = (curr, accum) => (curr <= accum)
            break;
        }

        for (const key in this.#storage) {
          if (satisfies_conditions(this.#storage[key][protocol], cull[protocol])) {
            cull = this.#storage[key][protocol];
            target_key = key;
          }
        }

        this.#invalidate(key);
      }

    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Should occur on an interval and be started with init(), only if TTL enabled
   * Should go over every item in the cache, removing items that have expired
   * Should also check if expires_at has exceeded expires_at_max
   */
  async #enforce_ttl() {
    if (this.#ttl && this.#ttl.enabled) {
      this.#ttl_subroutine = setInterval(() => {

        const timestamp = Date.now();

        for (const key in this.#storage) {
          if (this.#storage[key].expires_at <= timestamp || this.#storage[key].expires_at_max <= timestamp) {
            this.#invalidate(key);
          }
        }
      }, this.#ttl.interval)
    }
  }

  async #interrogate_byte_constraints(report){
    try {
      const { cached_bytes, cached_ratio} = report;
      const bs_max = this.#caching.constraints.byte_size.max;
      const br_max = this.#caching.constraints.byte_ratio.max;
      const bs_min = this.#caching.constraints.byte_size.min;
      const br_min = this.#caching.constraints.byte_ratio.min;

      const result = {
        overflow: false,
        underflow: false
      }

      if (cached_bytes >= bs_max) {
        result.overflow = true;
      } else if (cached_ratio >= br_max) {
        result.overflow = true;
      } else if (cached_ratio <= br_min) {
        result.underflow = true;
      } else if (cached_bytes <= bs_min) {
        result.underflow = true;
      }

      return result;

    } catch(error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Receives the generated Chimera performance report, and interrogates fallback configurations to see if there are policy violations.
   * 
   * @param {*} report 
   * @returns boolean
   */
  async #interrogate_fallback(report) {

    try {

      if (this.#fallback_activated && (this.#fallback.protocol === 'flex' || this.#fallback.protocol === 'foreign-flex')) {

        const results = []
        if (this.#fallback.threshold.system) {
          const system_nominal = await this.#interrogate_performance({
            baseline: report.sys_mem_usage,
            key: 'sys_mem_usage',
            max: this.#fallback.threshold.system.max,
            min: this.#fallback.threshold.system.min - 5
          })

          results.push(system_nominal);
        }

        if (this.#fallback.threshold.process) {
          const process_nominal = await this.#interrogate_performance({
            baseline: report.heap_mem_usage,
            key: 'heap_mem_usage',
            max: this.#fallback.threshold.process.max,
            min: this.#fallback.threshold.process.min - 5
          })          

          results.push(process_nominal);
        }

        if (results.includes(true)) {

          return true;

        } else {

          this.#fallback_activated = false;
          this.#fallback_cancelled = true;
          return false;

        }

      }

      // if fallback is already active, or if fallback protocol disabled, then quit
      if (this.#fallback_activated || !this.#fallback.enabled) {
        return false;
      }
  
      // tests to see if system memory limits exceeded, and if fallback activation is necessary
      if (this.#fallback.threshold.system) {
        const result = await this.#interrogate_performance({
          baseline: report.sys_mem_usage,
          key: 'sys_mem_usage',
          max: this.#fallback.threshold.system.max,
          min: this.#fallback.threshold.system.min
        })

        if (result) {
          return result;
        }
      }

      // tests to see if process memory limits exceeded, and if fallback activation is necessary
      if (this.#fallback.threshold.process) {
        const result = await this.#interrogate_performance({
          baseline: report.heap_mem_usage,
          key: 'heap_mem_usage',
          max: this.#fallback.threshold.process.max,
          min: this.#fallback.threshold.process.min
        })

        if (result) {
          return result;
        }
      }

      return false;

    } catch (error) {

      console.error(error);

    }
  }

  /**
   * Gathers performance metrics to answer fallback interrogation calls.
   * 
   * @param {*} params 
   * @returns 
   */
  async #interrogate_performance(params = {}) {

    try {
      const {baseline, key, min, max} = params;
  
      const urgent = max <= baseline;
      const pending = (max > baseline) && (baseline >= min);
  
      if (urgent || (pending && !this.#fallback.grace)) {
  
        this.#fallback_activated = true;
        return true;
  
      } else if (pending && !this.#fallback_pending) {
  
        this.#fallback_pending = true;            // keeps consecutive gets/sets from performing this check and impacting performance
        const result = false;                     // returned at end of performance check
  
        const performance_checks = [baseline];    // establish a baseline for holding performance checks
  
        let time_remaining = this.#fallback.grace;
        let iterations = (time_remaining/5);
        
        /**
         * We set an interval that recurs for 5 separate checks across the fallback grace period.
         * It pushes all of the reports (Promises) to performance_checks.
         */
        const monitor_performance = setInterval(() => {
          if (!time_remaining) {
            clearInterval(monitor_performance);
            return;
          }
  
          this.#sys.report().then((response) => {
            performance_checks.push(response[key])
          });
          time_remaining -= iterations;
        }, iterations);

        /**
         * Now we wait for all of the #sys.report() Promises to resolve before proceeding.
         */
        const checks_completed = await Promise.all(performance_checks);

        /**
         * Now we take an average from the checks that have been completed.
         * We will use these checks to determine if we should activate fallback policy.
         */
        let average = (checks_completed.reduce((accum, curr) => {
          return accum += curr;
        }, 0)/checks_completed.length);
        
        if (average >= min) {
          this.#fallback_activated = true;  // tell all future gets/sets that we are now using fallback protocol
          this.#fallback_pending = false;   // reset this, since we have confirmed that fallback is activated
          result = true;
        } else {
          this.#fallback_pending = false;   // or, reset this because we are no longer pending a fallback evaluation
        } 

        return result;
      } else {
        return false;
      }

    } catch (error) {
      console.error(error);
      return error;
    }
  }

  #activate_fallback() {
    console.log("fallback activated");
  }

}

module.exports = ChimeraCache;