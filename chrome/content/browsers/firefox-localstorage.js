
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

