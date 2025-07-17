# About ChimeraCache

ChimeraCache is an experimental package which aims to provide a configurable, easy-to-use caching solution for developers. As a package, ChimeraCache enables developers to quickly establish volatile caching with non-volatile fallback caching using the Node.js File System module. ChimeraCache monitors your system's performance, as well as its own performance as a process, to determine when fallback caching should activate. In the event that the non-volatile fallback does not meet your needs, you may prescribe your own custom fallback procedures to offload caching to a remote solution or another process of your choosing.

## Features

ChimeraCache aims to be highly configurable, and will update to include quality of life features recommended by the community. The current version which is under production (v1) will allow for developers to set the following configurations:
| Setting | Feature | Feature Description |
| ------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalidation | Main Protocol | Alternate between `static, dynamic, LRU, custom` protocols to handle the invalidation of cached items on a defined subroutine. |
| Invalidation | TTL | Establish a minimum TTL that will be used to determine when an item should be removed from the cache. Optionally establish a maximum TTL. <br> |
| Invalidation | TTL - Extend | Optionally create a custom function that receives item details, and updates the current TTL for a cache item up to (not exceeding) maximum TTL. |
| Caching | Size Constraints | Limit the cache to retain a maximum specified quantity, useful for LRU fine-tuning. |
| Caching | Bytesize Constraints | Set a minimum (and maximum) bytesize allowed for caching in volatile storage. |
| Caching | Bytesize Ratios | Set a minimum (and maximum) bytesize percentage compared to system memory or process memory. |
| Caching | Overflow Protocol | Items exceeding bytesize constraints (or ratios) will be stored using the fallback policy for a hybrid caching approach. |

## Fallback Protocols

The fallback protocol chosen by your development team should reflect the needs of your application, as well as the hardware that will be hosting your server. ChimeraCache will constantly assess your system's available memory, in addition to the memory being used by ChimeraCache as a process. By default, ChimeraCache has fallback enabled and will initiate fallback protocols when system memory usage remains between the `threshold_min` and `threshold_max` for approximately 30 seconds.

- Flex: The `flex` protocol attempts to balance performance needs according to your system's memory usage. Upon reaching or exceeding the `fallback threshold`,
- Orphan:
- Foreign: The `foreign` protocol allows for end-users to establish their own fallback protocol, as well as `getForeign()` and `setForeign()`. This may be used to offload some caching of ChimeraCache's responsibilities to foreign infrastructures such as [Redis, etc.]
