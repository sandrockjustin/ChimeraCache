const SystemUtils = require('./sys_utils');

class ChimeraCache {

  /**
   * These are private and can NEVER be set by the end-user; for internal use only.
   */
  #sys = new SystemUtils();
  #subroutine = null;
  #fallback_activated = false;
  #fallback_handover_complete = true;

  /**
   * These can be changed by the user.
   */
  #config = {
    overrides: {
      ignore_defaults: false,
      export_settings: true,
      dirname: __dirname,
    },
    caching: {
      overflow: true,
      bytesize: {
        bytes: {
          enabled: false,
          max: 0,
          min: 0
        },
        ratio: {
          enabled: true,
          max: 0.1,
          min: 0
        },
      },
      limit: {
        enabled: false,
        max: 0
      }
    },
    ttl: {
      enabled: true,
      max: 900000,
      min: 300000,
      extensions: {
        enabled: true,
        custom: false
      }
    },
    fallback: {
      enabled: true,
      threshold: {
        max: 0.85,
        min: 0.7
      }
    },
  }

  constructor(){
  }

  #report(before, after) {
    return this.#sys.calculate_usage(before, after)
  }

  #isFallbackActivated() {
    if
  }

}

const test = new ChimeraCache();