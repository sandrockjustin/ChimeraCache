class CacheElement {

  constructor(options = {}){
    this.created_at = Date.now();
    this.expires_at = this.created_at + options.ttl.min;
    this.expires_at_max = this.created_at + options.ttl.max;
    this.last_accessed = Date.now();
    this.engagement = 1;
    this.data = options.data;
    this.path = options.path ? options.path : null;
  }

  // updates engagement for cache item, shows how recently accessed for LRU
  update(options = {}) {
    this.engagement += 1;
    this.last_accessed = Date.now();
  }

}

module.exports = CacheElement;