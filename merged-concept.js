class Cache {

  constructor(options) {
    this.#manifest = options.manifest_override ? options.manifest_override : {};
    this.#invalidation_protocol = options.invalidation_protocol ? options.invalidation_protocol.toUpperCase() : 'LRU';
  }

  #manifest = {};
  #invalidation_protocol = "lru";
  #fallback_protocol = false;
  #subprocess = null;

  invalidate(cache_key) {
    delete this.#manifest[cache_key]
  }

}

class Element {

  constructor(options){
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
  update(options) {
    this.engagement += 1;
    this.last_accessed = Date.now();
    options.invalidation_protocol(options.arguments);
  }

}