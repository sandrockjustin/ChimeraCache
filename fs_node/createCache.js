const fs = require('fs/promises');
const path = require('path')

class Cache {

	constructor(manifest = null, dirname = null){
		this.manifest = manifest ? manifest : {"createdAt": new Date()};
		this.path = dirname ? dirname : path.resolve();
		this.subroutine = null;
	}
	
	async init(){
		try {
			
			const manifest = await fs.readFile(`${this.path}/cache/manifest.json`);

			this.manifest = JSON.parse(manifest);

			console.log(`✓ Successful retrieval of cache manifest from '${this.path}/cache/manifest.json'.`)

			await fs.mkdir(`${this.path}/cache/storage`, {recursive: true});

			return this.manifest;

		} catch (error) {
			console.error(`× Error retrieving manifest from cache; initializing new manifest '${this.path}/cache/manifest.json'.`)

			if (error.message.includes("ENOENT: no such file or directory, open")) {
				fs.mkdir(`${this.path}/cache/storage`, {recursive: true});
				fs.writeFile(`${this.path}/cache/manifest.json`, JSON.stringify(this.manifest));
				console.log(`✓ Successful recovery; initialization of new cache manifest completed.`)
			} else {
				console.error(`× FATAL ERROR :: Failed to initialize manifest.\n`, error);
			}
		}
	}

	async startSubroutines(milliseconds, constraint = null){
		try {

			if (!constraint) {
				constraint = milliseconds;
			}

			for (const query in this.manifest) {

				if (this.manifest[query] + constraint <= Date.now()) {
					await fs.rm(`${this.path}/cache/storage/${query}.json`, { recursive: true, force: true });
					delete this.manifest[query];
					console.log(`→ Invalidated query ${query}.`);
				}

			}			
			
			await fs.writeFile(`${this.path}/cache/manifest.json`, JSON.stringify(this.manifest));

			console.log(`✓ Manifest saved to non-volatile memory; cache invalidation subroutines complete.`);

			if (this.subroutine === null) {
				this.subroutine = setInterval(() => {
					this.startSubroutines(milliseconds, constraint)
				}, milliseconds);
			}

		} catch (error) {
			console.error(`× Error during subroutines; error message follows.\n`, error);
		}
	}
	
	stopSubroutines() {
		if (this.subroutine) {
			clearInterval(this.subroutine);
			this.subroutine = null;
		}
	}

	async create(query, data) {
		try {
			
			const toJSON = JSON.stringify(data);	

			await fs.writeFile(`${this.path}/cache/storage/${query}.json`, toJSON);

			this.manifest[query] = Date.now();

			console.log(`→ Cached query '${query}'.`)

			return data;
			
		} catch (error) {
			console.error(`× Caching failed for query '${query} at ${new Date()}.\n`, error);
			return error;
		}
	}

	async fetch(query, cb = null, cbArgs = []) {
		try {

			const data = await fs.readFile(`${this.path}/cache/storage/${query}.json`);

			if (data) {
				return JSON.parse(data);
			}

		} catch (error) {

			console.error(`× Error fulfilling fetch of query ${query} from cache.`);

			if (cb) {
				console.log(`→ Executing callback function for a database pull.`);
				const dbPull = cb(...cbArgs);

				if (dbPull) {
					this.create(query, dbPull);
					console.log(`✓ Successful callback execution; cached query '${query}'.`);
					return dbPull;
				} else {
					console.error(`× Failure in callback execution for query '${query}'; the provided callback follows:`, cb);
					return error;
				}
			}

			return error;
		}
	}

}


export default Cache;



