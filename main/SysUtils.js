const os = require('node:os');

class SystemUtils {
  
  #sys_mem;
  #unalloc_mem;
  #alloc_mem;
  #sys_mem_usage;

  constructor() {
    this.#sys_mem = os.totalmem();
    this.#unalloc_mem = os.freemem();
    this.#alloc_mem = (this.#sys_mem - this.#unalloc_mem);
    this.#sys_mem_usage = (this.#alloc_mem / this.#sys_mem);
  }
  
  /**
   * Updates all memory usage for use in other methods; private so no spillage.
   */
  async #update() {
    try {
      this.#unalloc_mem = os.freemem();
      this.#alloc_mem = (this.#sys_mem - this.#unalloc_mem);
      this.#sys_mem_usage = (this.#alloc_mem / this.#sys_mem);    
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Calculates the bytes used in the caching of data for use in constraints and thresholds.
   * 
   * @param {*} before The process.memoryUsage().heapUsed before item was added to cache.
   * @param {*} after The process.memoryUsage().heapUsed after item was added to cache.
   * @returns An object representing the total amount of bytes used to cache this item, and a ratio of bytes : sys_mem for use in fallback thresholds.
   */
  async report(before, after) {

    try {

      let caching_bytes_used = null;
      let caching_to_sys_ratio_used = null;  

      if (before && after) {
        caching_bytes_used = before - after;
        caching_to_sys_ratio_used = (caching_bytes_used / this.#sys_mem);  
      }
      
      this.#update();

      return {
        cached_bytes: caching_bytes_used,
        cached_ratio: caching_to_sys_ratio_used,
        sys_mem_usage: this.#sys_mem_usage,
        heap_mem_usage: (process.memoryUsage().heapUsed/this.#sys_mem)
      }
    } catch (error) {
      console.error(error);
    }
  }

}

module.exports = SystemUtils;