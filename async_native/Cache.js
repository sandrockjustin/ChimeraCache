class Cache {

  constructor(){
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.contents = {};
  }

  // Creates a new item in Cache.contents for query
  create(query, data){
    this.contents[query] = new CacheElement(data);
    console.log(`✓ Created cache for query '${query}' at ${this.contents[query].createdAt}.`)
  }

  // Invalidates entire cache
  invalidate() {
    this.contents = {};
  }

  // first argument defines delay of subroutine execution
  // second argument defines terms for when an element should be deleted from cache
  startSubroutines(milliseconds, constraint) {
    this.interval = setInterval(() => {
      for (const element in this.contents) {
        if (this.contents[element].createdAt.getTime() + constraint <= Date.now()) {
          console.log(`× Invalidated cache for '${element}'.`);
          delete this.contents[element];
        }
      }

      console.log(`→ COMPLETED: Invalidation subroutines at ${new Date()}.`)
    }, milliseconds);
  }

  stopSubroutines(){
    clearInterval(this.interval);
    console.log(`→ CANCELLED: Invalidation subroutines at ${new Date()}.`)
  }


  // enables easy retrieval of query from Cache
  async get(query, cb = null) {

    try {

      const isCached = this.contents.hasOwnProperty(query);

      // if cached, then return it
      if (isCached){

        return this.contents[query].data;

      // if not cached, cb() should return data from database for caching
      } else if (!isCached && cb) {

        const contents = await cb();

        // if cb() successful, write to cache
        if (contents) {
          this.create(query, contents);
          return contents;
        }

      // else return null
      } else {
        return null;
      }

    } catch (error) {

      console.error(error);
      return error;

    }

  }

}

class CacheElement {
  constructor(data) {
    this.createdAt = new Date();
    this.data = data;
  }
}


export default Cache;

/*
module.exports = Cache;
*/