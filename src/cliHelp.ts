export const cli = `
sludge CLI

deno run src/sludge.ts { arguments }

Arguments:
	
	--development			Development mode for local deployment (default)
	
	--test				Test mode for generating files without running server
	
	--production			Production mode for running sludge on a server
	
	--dir="<file path>"		Set directory for saving files, e.g. ~/.sludge
	
	--port="<port>"			Port for running sludge app, e.g. 8080
	
	--public="<url>"		URL for accessing sludge API, e.g. https://example.com/
	
	--files="<url>"			URL for accessing sludge audio, e.g. https://example.com/audio/

	--configure			Generate templates for nginx and system services to run server
					Development mode will work on Linux / OS X and only run nginx
					Test mode will only output configuration files
					Production mode works only on Linux and run nginx and systemd services
	
	--nginx="<port>"		Port that nginx will be exposed on, e.g. 80
	
	--host="<host/ip>"		Address that will be used to access nginx, e.g. example.com
	
	--cache="<days>"		Number of days to cache audio files, e.g. 30
	
	--conf="<file name>"		Name of nginx configuration file, default is sludge_nginx
	
	--service="<file name>"		Name of service file, default is sludge_server

	--idLength="<number>"		Length of ID to use for stream IDs, e.g. 10

	--idAlphabet="<chars>"		Characters to use in ID for stream IDs,
					e.g. 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-
	
	--help				Show this information screen
`