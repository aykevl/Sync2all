
// Make a generic console. Outputs to the system console
// TODO: dump to error console
// TODO: use a 'debugging' flag
var nsIConsoleService = Components.classes["@mozilla.org/consoleservice;1"]
    .getService(Components.interfaces.nsIConsoleService);

if (!console) {
	var console = {
		log: function (s) {
			dump('INFO:\t'+s+'\n');
			//Components.utils.reportMessage(s);
			//nsIConsoleService.logStringMessage(s);
		},
		error: function (s) {
			//dump('ERR:\t'+s+'\n');
			Components.utils.reportError(s);
		},
		warn: function (s) {
			//dump('WARN:\t'+s+'\n');
			nsIConsoleService.logStringMessage(s);
		}
	};
}

// Use localStorage for a Firefox extension
// Thanks to:
// http://farter.users.sourceforge.net/blog/2011/03/07/using-localstorage-in-firefox-extensions-for-persistent-data-storage/


var url = "http://sync2all.github.com";
var ios = Components.classes["@mozilla.org/network/io-service;1"]
          .getService(Components.interfaces.nsIIOService);
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
