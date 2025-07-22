class Entry {
  #extend_by;
  
  constructor(options = {}){
    const {data = null, ttl = null, method = null} = options;

    this.created_at = Date.now();
    this.expires_at = Date.now() + (ttl.min ? ttl.min : 300000);
    this.expires_at_max = Date.now() + (ttl.max ? ttl.max : 480000);
    this.last_accessed = Date.now();
    this.engagement = 1;
    this.method = method;
    this.bytes = 0;
    this.data = data;

    this.#extend_by = ttl.extend_by ? ttl.extend_by : null;
  }

  update() {
    this.last_accessed = Date.now();
    this.engagement++;
  }

}

module.exports = Entry;