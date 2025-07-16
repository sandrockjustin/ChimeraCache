const os = require('os');

class ChimeraCache {

  constructor(options = {}) {
    this.#manifest = options.manifest_override ? options.manifest_override : {};
    this.#invalidation_protocol = options.invalidation_protocol ? options.invalidation_protocol.toUpperCase() : 'LRU';
    this.#fallback_protocol = options.fallback_protocol ? options.fallback_protocol : true;
    this.#fallback_threshold = options.fallback_threshold ? options.fallback_threshold : 0.8;
    this.#fallback_activated = false;
  }

  #manifest = {};
  #invalidation_protocol = "lru";
  #fallback_protocol = false;
  #fallback_threshold = 0.8;
  #fallback_activated = false;
  #subprocess = null;
  #sys_mem = os.totalmem();

  invalidate(cache_key) {
    delete this.#manifest[cache_key]
  }

  invalidateAll() {

  }

  // System check on memory to see if fallback protocol is necessary
  sys_mem_check(){
    const unalloc_mem = os.freemem();
    const alloc_mem = (this.#sys_mem - unalloc_mem);
    const percent_mem = alloc_mem / this.#sys_mem;

    if (percent_mem >= this.#fallback_threshold) {
      sys_mem_fallback();
    }
  }

  sys_mem_fallback(sys_info) {
    console.log(`→ System Memory Usage: ${sys_info.alloc_mem}/${this.#sys_mem} (${(sys_info.percent_mem * 100).toFixed(2)}%) has exceeded fallback policy threshold of (${(this.#fallback_threshold * 100).toFixed(2)}%).`)

    if (!this.#fallback_protocol) {
      console.error(`→ Warning: Fallback protocol is disabled (false) and will not be executed.`);
    } else {


      /**
       * Write code to begin hybrid-caching mode with Node file system
       */

    }
  }

}

class Element {

  constructor(options = {}){
    this.created_at = Date.now();
    this.expires_at = this.created_at + options.protocol_base_constraint;
    this.expires_at_max = this.created_at + options.protocol_max_constraint;
    this.last_accessed = Date.now();
    this.engagement = 1;
    this.cache_key = options.cache_key;
    this.data = options.data;
  }

  // when invoked, used to invalidate this item in cache
  invalidate(cache) {
    if (this.cache_key) {
      delete cache[this.cache_key];     // deletes from cache
      cache.invalidate(this.cache_key); // deletes from manifest
    }
  }

  // updates engagement for cache item, shows how recently accessed for LRU
  update(options = {}) {
    this.engagement += 1;
    this.last_accessed = Date.now();
    options.invalidation_protocol(options.arguments);
  }

}

const test = new Cache();

test.sys_mem_check();