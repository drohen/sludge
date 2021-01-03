# sludge

live audio streaming server

## Install

-   Download [deno](https://deno.land/) (tested with v1.6.3)

## Setup


### API

-   Before running, ensure files and directories exist:

```shell
make init
```

NOTE: You will need to provide values for these variables

**Nginx port**

This is the port from which the nginx proxy server for sludge will run

**Service hostname**

This is the base URL hostname where sludge will be accessed

**Additional hostnames**

More hostnames (not required)

**Sludge port**

Port to run the sludge deno app

**Public url**

The URL (including any paths, without trailing slash) where sludge app is accessed

**Files url**

Base URL (including any paths, **with** trailing slash) where audio file segments are accessed

**Splutter url**

Full URL for the splutter app associated with this sludge instance (they must belong on the same domain)

### Dev

#### Server

-   Pass environment variables and run:

```shell
SLUDGE_PUBLIC="http://some.url/" SLUDGE_FILES="http://some.url/audio/" SLUDGE_PORT="8000" make run
```

NOTE: trailing slash should be included at the end of the URLs
