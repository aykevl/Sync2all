
if (!console) {
	var console = {
		log: function (s) {
			dump('INFO:\t'+s+'\n');
		},
		error: function (s) {
			dump('ERR:\t'+s+'\n');
		},
		warn: function (s) {
			dump('WARN:\t'+s+'\n');
		}
	};
}
