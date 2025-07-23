const merger = require('./deps/utils/merger');
const path = require('node:path');

class ChimeraCache {

  #version = `ChimeraCache v6`;
  #config;


  constructor(config = null, foreign) {

    
    if (!config) {
      this.#load_defaults();
    } else if (!config.overrides || !config.overrides.preserve_defaults) {
      this.#config = config;
    } else {
      const {overrides = null, caching = null, ttl = null, fallback = null} = config;
      this.#load_defaults();

      const merged = merger(config);
      console.log(merged);
      this.#config = merged;
    }

  }

  #load_defaults() {

    const overrides = {
      path: path.resolve(),
      preserve_defaults: false,
      disable_parsing: false
    }

    const caching = {
      bytes: {
        size: {
          enabled: false,
          max: 0,
          min: 0
        },
        ratio: {
          enabled: false,
          max: 0,
          min: 0
        }
      },
      limit: {
        enabled: false,
        protocol: null,
        max: 0,
        min: 0
      }
    }

    const ttl = {
      enabled: true,
      extend_by: 0,
      interval: 0,
      max: 0,
      min: 0
    }

    const fallback = {
      enabled: true,
      thresholds: {
        system: {
          enabled: false,
          max: 0,
          min: 0
        },
        process: {
          enabled: false,
          max: 0,
          min: 0
        },
        chimera: {
          system: {
            enabled: false,
            max: 0,
            min: 0
          },
          process: {
            enabled: false,
            max: 0,
            min: 0
          }
        }
      },
      monitoring: {
        duration: 0,
        samples: 0,
        delay: 0
      },
      foreign: {
        enabled: false,
        get: null,
        set: null
      }
    };

    return {overrides, caching, ttl, fallback};
  }


}

const Cache = new ChimeraCache({
  overrides: {
    preserve_defaults: true,
  },
  caching: null,
  ttl: null,
  fallback: null,
});