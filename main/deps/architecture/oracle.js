const os = require('node:os');

/**
 * Instances a new Oracle. The Oracle assists the Interrogator and Enforcer architectures by providing
 * them with insights into system performance, especially for the purposes of activating fallback 
 * policies and bytesize data constraints. The Oracle is imperfect, and can only give approximations
 * due to language constraints.
 */
class Oracle {
  /**
   * These private properties are specific to how ChimeraCache operates and attempts tracking of
   * memory within the constraints of the JavaScript language. They are also used to facilitate the
   * operations of the interrogator instance.
   */
  #monitoring = {
    active: false,
    subroutine: null,
  };

  #chimera = {
    allocated: 0,
    system_usage: 0,
    process_usage: 0
  }

  #system;
  #process;
  /**
   * The Oracle object is instanced by the Interrogator of ChimeraCache; it is responsible for
   * performance metrics including fallback, overflow, and bytesize evaluations. 
   */
  constructor(monitoring) {

    const {duration, samples, delay} = monitoring;
    this.#monitoring.duration = duration ? duration : 30000;
    this.#monitoring.samples = samples ? samples : 5;
    this.#monitoring.delay = delay ? delay : 30000;

    const total = os.totalmem();
    const unallocated = os.freemem();
    const allocated = total - unallocated;
    const usage = allocated / total;

    const rss = process.memoryUsage().rss;

    this.#system = {
      total,
      unallocated,
      allocated,
      usage,
    }

    this.#process = {
      rss,
      system_usage: (rss / total),
    }
  }

  #debug() {
    console.log(`System Usage: (${(this.#system.usage * 100).toFixed(2)})% Chimera System Usage: (${(this.#chimera.system_usage * 100).toFixed(2)})% || Process Usage: (${(this.#process.system_usage * 100).toFixed(2)})% Chimera Process Usage: (${(this.#chimera.process_usage * 100).toFixed(2)})%`);
  }

  /**
   * Updates all values associated with ChimeraCache's performance metrics.
   */
  #update() {
    this.#system.unallocated = os.freemem();
    this.#system.allocated = this.#system.total - this.#system.unallocated;
    this.#process.rss = process.memoryUsage().rss;
    
    /**
     * Why are we doing this? Well, it's because of how NodeJS OS modules work. They account for
     * actual allocated memory, but some systems (such as Windows) do not count 'Standby' memory
     * that is used for caching as 'memory that is in use' which skews metrics. This is not a 
     * perfect solution, which is why future versions of ChimeraCache will be JavaScript speaking
     * with performant C/C++ code that has better access to these kinds of data.
     */
    this.#system.usage = (this.#system.allocated + this.#chimera.allocated) / this.#system.total;

    this.#process.system_usage = this.#process.rss / this.#system.total;
    this.#chimera.system_usage = this.#chimera.allocated / this.#system.total;
    this.#chimera.process_usage = this.#chimera.allocated / this.#process.rss;
    //this.#debug();
  }

  /**
   * Updates (adds to) the approximated amount of bytes in use by ChimeraCache.
   * @param {*} bytes 
   * @returns 
   */
  async allocate(bytes) {
    try {
      this.#chimera.allocated += bytes;
      this.#update();               
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Updates (subtracts from) the approximated amount of bytes in use by ChimeraCache.
   * @param {*} bytes 
   * @returns 
   */
  async free(bytes) {
    try {
      this.#chimera.allocated -= bytes;
      this.#update();               
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Audits are performed to see if data entering the cache exceeds byte constraints.
   * @param {*} options 
   * @returns 
   */
  async audit(options = {}) {

    try {

      const latest = process.memoryUsage().heapUsed;
      const {baseline = null, caching = null} = options;
      const {bytes = null} = caching;
      const data = latest - baseline;
  
      const report = {
        underflow: false,
        overflow: false,
        bytes: data
      }
  
      if (bytes && bytes.size && bytes.size.enabled) {
        if (data >= bytes.size.max) report.overflow = true;
        if (data < bytes.size.min) report.underflow = true;
      }
  
      if (bytes && bytes.ratio && bytes.ratio.enabled) {
        if ((data/this.#system.total) >= bytes.ratio.max) report.overflow = true;
        if ((data/this.#system.total) < bytes.ratio.min) report.underflow = true;
      }
  
      return report;
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Initiates a performance metrics subroutine for Interrogator architecture. If it is determined that
   * 
   * @returns An average of performance metrics (object) after specified sampling and duration.
   */
  async performance_monitoring(routine = true) {

    try {
      if (this.#monitoring.active) return null;

      this.#update();
      
      const metrics = [{
        system: this.#system,
        process: this.#process,
        chimera: this.#chimera
      }];
      
      if (routine) return metrics[0];
      
      this.#monitoring.active = true;
  
      await new Promise((resolve, reject) => {
        let collected = 0; 
  
        this.#monitoring.subroutine = setInterval(async () => {
          try {
            await this.#update();
            metrics.push({
              system: this.#system,
              process: this.#process,
              chimera: this.#chimera
            });
            collected++;
  
            if (collected >= (this.#monitoring.samples - 1)) {
              clearInterval(this.#monitoring.subroutine);
              resolve();
            }
          } catch (err) {
            clearInterval(this.#monitoring.subroutine);
            reject(err);
          }
        }, this.#monitoring.duration / (this.#monitoring.samples - 1));
      });
  
      const average = metrics.reduce((accum, curr) => {
        return {
          system: {
            unallocated: accum.system.unallocated + curr.system.unallocated,
            allocated: accum.system.allocated + curr.system.allocated,
            usage: accum.system.usage + curr.system.usage
          },
          process: {
            rss: accum.process.rss + curr.process.rss,
            system_usage: accum.process.system_usage + curr.process.system_usage
          }, 
          chimera: {
            allocated: accum.chimera.allocated + curr.chimera.allocated,
            system_usage: accum.chimera.system_usage + curr.chimera.system_usage,
            process_usage: accum.chimera.process_usage + curr.chimera.process_usage
          }       
        }
      })
  
      average.system.unallocated /= metrics.length;
      average.system.allocated /= metrics.length;
      average.system.usage /= metrics.length;
      average.process.rss /= metrics.length;
      average.process.system_usage /= metrics.length;
      average.chimera.allocated /= metrics.length;
      average.chimera.system_usage /= metrics.length;
      average.chimera.process_usage /= metrics.length;
  
      setTimeout(() => {
        this.#monitoring.active = false;
      }, this.#monitoring.delay);
  
      return average;
  
    } catch (error) {
      console.error(error);
      return error;
    }
  }

}

module.exports = Oracle;