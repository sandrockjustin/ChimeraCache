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


  /**
   * These can be changed by the user.
   */

  #get_foreign = null;
  #set_foreign = null;

  #overrides = {
    enable_debug: false,
    ignore_defaults: true,
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
    system: {
      enabled: true,
      threshold: {
        max: 0.85,
        min: 0.7
      }
    },
    process: {
      enabled: true,
      threshold: {
        max: 0.85,
        min: 0.7
      }
    }
  }

  constructor(options = {}, get_foreign = null, set_foreign = null) {
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

    if (get_foreign || set_foreign) {
      this.#get_foreign = get_foreign;
      this.#set_foreign = set_foreign;
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

      if (this.#ttl.enabled) {
        this.#enforce_ttl();
      }

      setInterval(() => {
        this.#metrics_monitoring();
      }, 1000)

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


  async #metrics_monitoring(){
    const curr = await this.#sys.report();
    const nodeP = process.memoryUsage();
    console.log(`System Memory Usage: ${(curr.sys_mem_usage * 100).toFixed(2)}% | Heap-System Usage: ${(curr.heap_mem_usage * 100).toFixed(2)}% | RSS: ${nodeP.rss} | Heap Total: ${nodeP.heapTotal} | Heap Usage: ${nodeP.heapUsed} | Cached: ${Object.keys(this.#storage).length} | Staged: ${Object.keys(this.#staging).length}`);
  }

  #debug(i, msg) {
    if (this.#overrides.enable_debug) {
      const chars = ['×','✓','→']
      console.log(`${chars[i]} ${msg}`);
    }
  }

  async set(cache_key, data) {
    try {

      const key = this.sanitize(cache_key);

      this.#debug(2, `[SET] Sanitized '${cache_key}' is '${key}'.\n`)

      const before = process.memoryUsage().heapUsed;
  
      this.#staging[key] = new CacheElement({
        ttl: {
          max: this.#ttl.max,
          min: this.#ttl.min
        }, 
        data: data
      });

      
      const after = process.memoryUsage().heapUsed;
      this.#debug(2, `[STG] '${key}' for caching with an estimated heap memory usage (bytes) of [${after - before}].\n`);
      
      await this.#enforcer(key, before, after);
    } catch (error) {
      console.error(error);
    }

  }

  async get(cache_key) {
    try {

      const key = this.sanitize(cache_key);

      this.#debug(2, `[GET] Sanitized '${cache_key}' is '${key}'.\n`)

      if (this.#storage[key]) {
  
        if (this.#storage[key].method) {

          this.#debug(2, `[GET] Found NVM cache with method ${this.#storage[key].method} under path '${this.#overrides.dirname}/ChimeraCache/storage/${key}.json'.\n`)
          
          const cache = await fs.readFile(`${this.#overrides.dirname}/ChimeraCache/storage/${key}.json`);
          this.#debug(1, `[GET] NVM cache '${key}' parsed; VM updating peripherals and returning data.\n`)

          this.#storage[key].update();
          return JSON.parse(cache);

        } else {

          this.#debug(1, `[GET] Found VM cache for '${key}', updating peripherals and returning data.\n`)
          this.#storage[key].update();
          return this.#storage[key].data;
          
        }

      } else if (this.#foreign_storage[key]) {
        
        this.#debug(2, `[GET] Foreign request with key '${key}'.\n`);
        const cache = await this.#get_foreign(key);
          
        if (cache) {
          this.#debug(1, `[GET] Success on retrieval of foreign cache; returning data now.\n`);
          return cache;
        } else {
          this.#debug(0, `[GET] Failure to retrieve foreign cache with key '${key}'; cache may have expired. Removing from foreign cache manifest.\n`);
          delete this.#foreign_storage[key];
          return null;
        }

      } else {
        this.#debug(0, `[GET] Request with key '${key}' yielded no results in NVM, VM, or foreign cache manifests.\n`)
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
      this.#debug(2, `[INV] Sanitized '${cache_key}' is '${key}'.\n`)
  
      // delete non-volatile caching if exists
      if (this.#storage[key].method) {
        this.#debug(2, `[INV] Found NVM '${key}' stored with method ${this.#storage[key].method}, fulfilling invalidation.\n`);
        fs.rm(`${this.#overrides.dirname}/ChimeraCache/caching/storage/${key}.json`, { recursive: true, force: true });
      }
  
      this.#debug(2, `[INV] Invalidating cached item '${key}' from VM cache.\n`);
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
      this.#debug(2, `[STG] Gathered constraints from configuration files.\n`);

      if (limit && limit.enabled && limit.max) {
        this.#debug(2, `[ENF] → [ENF_L] Calling limit enforcer against cache storage.\n`);
        this.#enforce_limits();
      }

      /**
       * This code block is executed if fallback is not active.
       */
      if ((byte_size && byte_size.enabled) || (byte_ratio && byte_ratio.enabled)){

        const bytes_reported = await this.#interrogate_byte_constraints(report);     // we check to see if this has any byte constraint violations, we do this first to see if we can fit in overflow
        this.#debug(1, `[INT] → [ENF] Received report for enforcement; overflow was ${report.overflow ? 'detected' : 'not detected'}. Underflow was ${report.underflow ? 'detected' : 'not detected'}.\n`)

        if ((bytes_reported.overflow||this.#fallback_activated) && !(this.#get_foreign || this.#set_foreign)) {
          this.#debug(2, `[ENF] Addressing ${this.#fallback_activated ? `${key} for fallback without foreign protocol.\n` : `reported overflow for '${key}' by storing in NVM.\n`}`);
          const path = `${this.#overrides.dirname}/ChimeraCache/caching/storage/${key}.json`;               

          this.#debug(2, `[STG] → [ENF] → [NVM] Cache item '${key}' by storing in NVM as JSON.\n`);
          await fs.writeFile(path, JSON.stringify(this.#staging[key].data));                      

          this.#debug(2, `[ENF] × [STG] Clearing '${key}' from staging after successful storage.\n`);
          delete this.#staging[key];

          this.#storage[key] = new CacheElement({
            ttl: {
              min: this.#ttl.min,
              max: this.#ttl.max,
            }, 
            method: this.#fallback_activated ? 'fallback' : 'overflow'
          });          
          
          this.#debug(1, `[ENF] → [CHE] New VM peripheral established for '${key}'.\n`)

        } else if (bytes_reported.overflow || this.#fallback_activated) {

          this.#debug(2, `[STG] → [ENF] → [FRN] ${this.#fallback_activated ? `Processing fallback activation for '${key}' with foreign protocol.\n` : `Storing overflow '${key}' in foreign cache.\n`}`);
          this.#set_foreign(key, this.#staging[key].data);
          this.#foreign_storage[key] = this.#fallback_activated ? 'fallback' : 'overflow';
          this.#debug(2, `[ENF] × [STG] Clearing '${key}' from staging after successful handover to foreign cache.\n`);
          delete this.#staging[key];       

        } else if (bytes_reported.underflow) {
          this.#debug(2, `[ENF] × [STG] Clearing underflow '${key}' from staging; will not be cached.\n`);
          delete this.#staging[key];
        } else {
          this.#debug(2, `[STG] → [ENF] → [CHE] Storing '${key}' in VM cache.\n`);
          this.#storage[key] = new CacheElement({
                ttl: {
                  min: this.#ttl.min,
                  max: this.#ttl.max,
                },
                data: this.#staging[key].data
              });
          this.#debug(1, `[ENF] Successful storage of '${key}' in VM cache.\n`);
          delete this.#staging[key];
          this.#debug(2, `[ENF] × [STG] Clearing '${key}' from staging after successful handover to VM cache.\n`)          
        }
      } else if (this.#fallback_activated && !(this.#get_foreign || this.#set_foreign)) {
          this.#debug(2, `[ENF] Fallback is currently active; a foreign protocol does not exist.\n`)
          const path = `${this.#overrides.dirname}/ChimeraCache/caching/storage/${key}.json`;               

          this.#debug(2, `[STG] → [ENF] → [NVM] Storing '${key}' data in non-volatile memory.\n`);
          await fs.writeFile(path, JSON.stringify(this.#staging[key].data));                      

          this.#debug(2, `[ENF] × [STG] Clearing '${key}' from staging after successful handover to NVM.\n`)
          delete this.#staging[key];

          this.#storage[key] = new CacheElement({
            ttl: {
              min: this.#ttl.min,
              max: this.#ttl.max,
            }, 
            method: this.#fallback_activated ? 'fallback' : 'overflow'
          });                           
          this.#debug(1, `[ENF] → [CHE] Peripherals for '${key}' stored in VM cache.\n`);
      } else if (this.#fallback_activated) {
          this.#debug(2, `[ENF] Fallback is currently active with a foreign protocol.\n`);
          this.#set_foreign(key, this.#staging[key].data);
          this.#debug(1, `[STG] → [ENF] → [FRN] Successful storage of '${key}' in foreign cache.\n`);
          this.#foreign_storage[key] = this.#fallback_activated ? 'fallback' : 'overflow';
          this.#debug(0, `[ENF] × [STG] Clearing '${key}' from staging after successful handover to foreign cache.\n`);
          delete this.#staging[key];  
      } else {
        this.#debug(2, `[STG] → [ENF] → [CHE] Storing '${key}' in VM cache.\n`);
        this.#storage[key] = new CacheElement({
              ttl: {
                min: this.#ttl.min,
                max: this.#ttl.max,
              },
              data: this.#staging[key].data
            });
        this.#debug(1, `[ENF] Successful storage of '${key}' in VM cache.\n`);
        delete this.#staging[key];
        this.#debug(2, `[ENF] × [STG] Clearing '${key}' from staging after successful handover to VM cache.\n`)
      }

      report = await this.#sys.report();
      this.#debug(2, `[ENF] Reporting ${(report.sys_mem_usage * 100).toFixed(2)}% total system memory in use. NodeJS is using ${(report.heap_mem_usage * 100).toFixed(2)}% of total system memory.\n`);
      this.#debug(2, `[ENF] → [INT] Sending report details to fallback interrogator for processing.\n`)
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
      this.#debug(2, `[ENF_L] Detected ${current_size} items in cache; limit is ${this.#caching.constraints.limit.max}.\n`);
      
      if (current_size >= this.#caching.limit.max) {
        const protocol = this.#caching.constraints.limit.protocol;
        this.#debug(2, `[ENF_L] Initiating culling with protocol: '${protocol}'.\n`);

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
            this.#debug(2, `[ENF_L] Cache '${key}' produced '${this.#storage[key][protocol]}' and lost against ${cull[protocol]}.\n`);
            cull = this.#storage[key][protocol];
            target_key = key;
          }
        }

        this.#debug(1, `[ENF_L] Culling '${target_key}' with the lowest scoring value of ${this.#storage[target_key][protocol]} using the '${protocol}' protocol.\n`);

        this.#invalidate(key);

        this.#debug(1, `[ENF_L] × [CHE] Cleared ${target_key} from VM; current cache quantity is ${Object.keys(this.#storage).length}.\n`);
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
        this.#debug(2, `[TTL] Time-based invalidation is occurring on an interval of ${this.#ttl.interval}ms.\n`);

        for (const key in this.#storage) {
          if (this.#storage[key].expires_at <= timestamp || this.#storage[key].expires_at_max <= timestamp) {
            this.#invalidate(key);
          }
        }
      }, this.#ttl.interval)

      this.#debug(1, `[TTL] × [CHE/NVM] Interval complete; the next interval will occur in ${this.#ttl.interval}ms.\n`);
    }
  }

  async #interrogate_byte_constraints(report){
    try {

      const { cached_bytes, cached_ratio} = report;
      const {byte_size = null, byte_ratio = null} = this.#caching.constraints;
      const result = {
        overflow: false,
        underflow: false
      }

      if ((!byte_size && !byte_ratio) || !(byte_size.enabled || byte_ratio.enabled)) {
        return result;
      }

      const bs_max = byte_size.max;
      const br_max = byte_ratio.max;
      const bs_min = byte_size.min;
      const br_min = byte_ratio.min;



      if ((byte_size.enabled) && (cached_bytes >= bs_max)) {
        this.#debug(2, `[INT] Recently cached bytes ${cached_bytes} exceeds ${bs_max}, resulting in an overflow.\n`);
        result.overflow = true;
      } else if ((byte_ratio.enabled) && (cached_ratio >= br_max)) {
        this.#debug(2, `[INT] Recent cached bytes-to-system ratio ${cached_ratio} exceeds ${br_max}, resulting in an overflow.\n`);
        result.overflow = true;
      } else if ((byte_ratio.enabled) && (cached_ratio <= br_min)) {
        this.#debug(2, `[INT] Recent cached bytes-to-system ratio ${cached_ratio} is below ${br_min}, resulting in an underflow.\n`);
        result.underflow = true;
      } else if ((byte_size.enabled) && (cached_bytes <= bs_min)) {
        this.#debug(2, `[INT] Recently cached bytes ${cached_bytes} is below ${bs_min}, resulting in an underflow.\n`);
        result.underflow = true;
      }

      this.#debug(1, `[INT] → [ENF] Interrogation of byte constraints complete, handing off to enforcer.\n`);
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
        if (this.#fallback.system.enabled) {
          const system_nominal = await this.#interrogate_performance({
            baseline: report.sys_mem_usage,
            key: 'sys_mem_usage',
            max: this.#fallback.system.threshold.max,
            min: this.#fallback.system.threshold.min - 5
          })

          results.push(system_nominal);
        }

        if (this.#fallback.process.enabled) {
          const process_nominal = await this.#interrogate_performance({
            baseline: report.heap_mem_usage,
            key: 'heap_mem_usage',
            max: this.#fallback.process.threshold.max,
            min: this.#fallback.process.threshold.min - 5
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
      if (this.#fallback_activated || !(this.#fallback.system.enabled || this.#fallback.process.enabled)) {
        return false;
      }
  
      // tests to see if system memory limits exceeded, and if fallback activation is necessary
      if (this.#fallback.system.enabled) {
        const result = await this.#interrogate_performance({
          baseline: report.sys_mem_usage,
          key: 'sys_mem_usage',
          max: this.#fallback.system.threshold.max,
          min: this.#fallback.system.threshold.min
        })

        if (result) {
          return result;
        }
      }

      // tests to see if process memory limits exceeded, and if fallback activation is necessary
      if (this.#fallback.process.enabled) {
        const result = await this.#interrogate_performance({
          baseline: report.heap_mem_usage,
          key: 'heap_mem_usage',
          max: this.#fallback.process.threshold.max,
          min: this.#fallback.process.threshold.min
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

  async #activate_fallback() {
    console.log("fallback activated");
  }

}

module.exports = ChimeraCache;