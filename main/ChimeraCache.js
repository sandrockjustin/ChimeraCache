const SystemUtils = require('./SysUtils');
const CacheElement = require('./CacheElement');
const fs = require('node:fs/promises');

class ChimeraCache {

  /**
   * These are private and can NEVER be set by the end-user; for internal use only.
   */

  #ttl_subroutine = null;
  #storage = {};
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
        max: 0
      }
    }
  }

  #ttl = {
    enabled: true,
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

    const key = this.sanitize(cache_key);
    // if we are in fallback mode, write to disk and skip everything else

    const before = process.memoryUsage().heapUsed;



    const after = process.memoryUsage().heapUsed
  }

  async get(cache_key) {
    try {

      const key = this.sanitize(cache_key);

      if(this.#storage[key] && this.fallback.custom) {

        if (this.#storage[key]) {
          this.#storage[key].update();
          return this.#storage[key].data;
        } else if (this.#fallback_activated) {
          const response = await getForeign(key);
          return response;
        } else {
          return null;
        }

      } else if (this.#storage[key]) {
  
        if (this.#storage[key].path) {
          
          const cache = await fs.readFile(`${this.overrides.dirname}/ChimeraCache/storage/${key}.json`);
          this.#storage[key].update();
          return JSON.parse(cache);

        } else {

          this.#storage[key].update();
          return this.#storage[key].data;
          
        }

      } else {
        return null;
      }
    } catch (error) {
      console.error(error);
    }
  }

  async sanitize(key) {
    try {
      return key.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
              .replace(/[\s.]+$/g, ''); 
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  async invalidate(cache_key) {
    try {
      const key = this.sanitize(cache_key);
  
      // delete non-volatile caching if exists
      if (this.$storage[key].path) {
        fs.rm(path, { recursive: true, force: true });
      }
  
      delete this.#storage[key];
    } catch (error) {
      console.error(error);
      return error;
    }
  }


  async #report(before, after) {
    try {
      const report = await this.#sys.report(before, after)
      return report;
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
  async #interrogate_ttl(){}

  /**
   * 
   */
  async #interrogate_limits(){
    try {

      const current_size = Object.keys(this.#storage).length;
  
      if (current_size >= this.#caching.limit.max) {
        
      }

    } catch (error) {
      console.error(error);
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
      // if fallback is already active, or if fallback protocol disabled, then quit
      if (this.#fallback_activated || !this.fallback.enabled) {
        return false;
      }
  
      // tests to see if system memory limits exceeded, and if fallback activation is necessary
      if (this.fallback.threshold.system) {
        const result = this.#interrogate_performance({
          baseline: report.sys_mem_usage,
          key: 'sys_mem_usage',
          max: this.fallback.threshold.system.max,
          min: this.fallback.threshold.system.min
        })

        if (result) {
          return result;
        }
      }

      // tests to see if process memory limits exceeded, and if fallback activation is necessary
      if (this.fallback.threshold.process) {
        const result = this.#interrogate_performance({
          baseline: report.heap_mem_usage,
          key: 'heap_mem_usage',
          max: this.fallback.threshold.process.max,
          min: this.fallback.threshold.process.min
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
      
          if (urgent) {
      
            this.#fallback_activated = true;
            return true;
      
          } else if (pending && !this.#fallback_pending) {
      
            // if no recovery window in config, immediately activate fallback
            if (!this.fallback.grace) {
              this.#fallback_activated = true;
              return true;
            }
      
            this.#fallback_pending = true;  // fallback activation is pending completion of this check
            const result = false;           // returned at end of performance check
      
            const performance_checks = [baseline];  // holds onto a series of memory usage ratios
      
            let time_remaining = this.fallback.grace;
            let iterations = (time_remaining/5);
            
            // interval-based testing of performance metrics
            const monitor_performance = setInterval(() => {
      
              if (!time_remaining) {
      
                Promise.all(performance_checks).then((checks_completed) => {
                  let average = (checks_completed.reduce((accum, curr) => {
                    return accum += curr;
                  }, 0)/checks_completed.length);
        
                  if (average >= min) {
                    this.#fallback_activated = true;
                    this.#fallback_pending = false;
                    result = true;
                    clearInterval(monitor_performance);
                  } else {
                    this.#fallback_pending = false;
                  }
        
                  clearInterval(monitor_performance);
                })

                return;
              }
      
              this.#sys.report().then((response) => {
                performance_checks.push(response[key])
              });
              time_remaining -= iterations;
            }, iterations);
            
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

const test = new ChimeraCache();