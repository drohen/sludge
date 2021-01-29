export const cli = `
sludge CLI

deno run src/sludge.ts { arguments }

Arguments:
	
	--development		Development mode for local deployment (default)
	
	--test			Test mode for generating files without running server
	
	--production		Production mode for running sludge on a server
	
	--dir="<file path>"	Set directory for saving files, e.g. ~/.sludge
	
	--port="<port>"		Port for running sludge app, e.g. 8080
	
	--public="<url>"	URL for accessing sludge API, e.g. https://ga.ge/
	
	--files="<url>"		URL for accessing sludge audio, e.g. https://ga.ge/audio/

	--configure		Generate templates for nginx and system services to run server
				Development mode will work on Linux / OS X and only run nginx
				Test mode will only output configuration files
				Production mode works only on Linux and run nginx and systemd services
	
	--nginx="<port>"	Port that nginx will be exposed on, e.g. 80
	
	--host="<host/ip>"	Address that will be used to access nginx, e.g. ga.ge
	
	--cache="<days>"	Number of days to cache audio files, e.g. 30
	
	--name="<file name>"	Name of nginx configuration file, default is sludge_nginx.conf
	
	--help			Show this information screen
`