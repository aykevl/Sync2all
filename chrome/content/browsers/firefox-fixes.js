'use strict';

// Make a generic console. Outputs to the system console
// TODO: dump to error console
// TODO: use a 'debugging' flag
var nsIConsoleService = Components.classes["@mozilla.org/consoleservice;1"]
    .getService(Components.interfaces.nsIConsoleService);

function o2s (o) {
	if (typeof (o) === 'object') {
		// dump the contents of the object
		var s = ':{';
		var key;
		for (key in o) {
			s += key+':'+o[key]+',';
		}
		s += '}';
		if (s.length > 1024*5) { // 5KB
			// should prevent the console to be filled with useless data
			return s.substr(0, 1024*5)+'..............';
		} else {
			return s;
		}
	}
	return o;
}

if (!console) {
	var console = {
		log: function (s) {
			s = o2s(s);
			dump('INFO:\t'+s+'\n');
			//Components.utils.reportMessage(s);
			//nsIConsoleService.logStringMessage(s);
		},
		error: function (s) {
			Components.utils.reportError(s);
			s = o2s(s);
			dump('ERR:\t'+s+'\n');
			// print stacktrace
			try {
				not_existing_function ();
			} catch (e) {
				dump(e.stack);
			}
		},
		warn: function (s) {
			s = o2s(s);
			dump('WARN:\t'+s+'\n');
			nsIConsoleService.logStringMessage(s);
		},
		trace: function () {
			// see http://eriwen.com/javascript/js-stack-trace/
			try {
				i.dont.exist += 1; // will raise an error
			} catch (e) {
				var lines = e.stack.split('\n');
				lines.shift(); // remove the last -- that line is just a dummy error.
				for (var i=0; i<lines.length; i++) {
					dump('TRACE:\t'+i+'. '+lines[i]+'\n');
				}
			}
		},
	};
}

// Use localStorage for a Firefox extension
// Thanks to:
// http://farter.users.sourceforge.net/blog/2011/03/07/using-localstorage-in-firefox-extensions-for-persistent-data-storage/


var url = "http://sync2all.github.com";
var ios = Components.classes["@mozilla.org/network/io-service;1"]
          .getService(Components.interfaces.nsIIOService);
var IOService = Components.classes["@mozilla.org/network/io-service;1"]
                .getService(Components.interfaces.nsIIOService); // yes, the same. FIXME
var ssm = Components.classes["@mozilla.org/scriptsecuritymanager;1"]
          .getService(Components.interfaces.nsIScriptSecurityManager);
var dsm = Components.classes["@mozilla.org/dom/storagemanager;1"]
          .getService(Components.interfaces.nsIDOMStorageManager);

var uri = ios.newURI(url, "", null);
var principal = ssm.getCodebasePrincipal(uri);
var localStorage = dsm.getLocalStorageForPrincipal(principal, "");

// Make a normal XMLHttpRequest object
// https://developer.mozilla.org/En/Using_XMLHttpRequest#Using_XMLHttpRequest_from_JavaScript_modules_.2f_XPCOM.c2.a0components
function XMLHttpRequest() {
	var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
						.createInstance(Components.interfaces.nsIXMLHttpRequest);
	// return seems to work... This way, no code has to be re-written.
	return req;
}

var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                              .getService(Components.interfaces.nsIPromptService);

function alert(s) {
	return promptService.alert(null, "Sync2all prompt", s);
}

function confirm(s) {
	return promptService.confirm(null, "Sync2all prompt", s);
}

function setTimeout(callback, interval) {
	var timer = Components.classes["@mozilla.org/timer;1"]
			   .createInstance(Components.interfaces.nsITimer);
	// ensure callback isn't undefined (I had this error once... hard to debug!)
	if (!callback) throw 'TypeError: callback is undefined';
	timer.initWithCallback({notify: callback}, interval,
			Components.interfaces.nsITimer.TYPE_ONE_SHOT);
}

// FUEL
var Application = Components.classes["@mozilla.org/fuel/application;1"].getService(Components.interfaces.fuelIApplication);

