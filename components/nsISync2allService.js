var SYNC2ALL_CONTRACTID = '@github.com/sync2all;1';
var SYNC2ALL_CID = Components.ID('{5d20fa2b-38c7-4167-b8f5-d9f26bcbb1bc}');
var SYNC2ALL_IID = Components.interfaces.nsISync2allService;

// All JS files of which this extension is made
var SYNC2ALL_SOURCES = [

	// Firefox-specific library (to let it use webstandards in XPCOM
	'chrome://sync2all/content/browsers/firefox-fixes.js',

	// libraries

	// My own libraries
	'chrome://sync2all/content/globals.js',
	'chrome://sync2all/content/utils.js',
	// Other libraries
	'chrome://sync2all/content/extern/oauth.js',
	'chrome://sync2all/content/extern/sha1.js',
	'chrome://sync2all/content/extern/operalink.js',

	// link libraries
	'chrome://sync2all/content/link.js',
	'chrome://sync2all/content/link_tagBased.js',
	'chrome://sync2all/content/link_treeBased.js',
	'chrome://sync2all/content/browserlink.js',
	'chrome://sync2all/content/tagtree.js',

	// browser
	'chrome://sync2all/content/browsers/firefox.js',

	// links
	'chrome://sync2all/content/links/google-bookmarks.js',
	'chrome://sync2all/content/links/opera-link.js',
	// no Firefox Sync library in Firefox. Firefox has already support for it built in...

	// sync engine
	'chrome://sync2all/content/sync2all.js',
];

var gSync2all;

function nsSync2allService() {
	//Who needs interfaces anyway
	this.wrappedJSObject = this;
	gSync2all=this;

	// Load all JS files to the nsSync2allService object
	// FIXME the wrong place, but won't harm because this class will be instantiated only once. See todo.
	// TODO make Sync2all not depend on global variables, so we won't have this problem again.
	const subScriptLoader = Components.classes['@mozilla.org/moz/jssubscript-loader;1']
					.getService(Components.interfaces.mozIJSSubScriptLoader);
	var Sync2all_source;
	for (var i=0; Sync2all_source=SYNC2ALL_SOURCES[i]; i++) {
		subScriptLoader.loadSubScript(Sync2all_source, this);
	}
	this.sync2all.run();
}

nsSync2allService.prototype = {
	reverseCount: 0,
	// Remove this, only to test whether XPCOM works.
	reverseIt: function (s) {
		var a = s.split('');
		a.reverse();
		this.reverseCount+=1;
		return this.reverseCount+a.join('');
	},
	//Required
	QueryInterface: function(iid) {
		if (!iid.equals(Components.interfaces.nsISupports) &&
			!iid.equals(SYNC2ALL_IID))
			throw Components.results.NS_ERROR_NO_INTERFACE;
		return this;
	},
};

var nsSync2allServiceModule = {
	registerSelf: function(compMgr, fileSpec, location, type) {
		compMgr =
		compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
		compMgr.registerFactoryLocation(SYNC2ALL_CID,
										"Sync2all",
										SYNC2ALL_CONTRACTID,
										fileSpec,
										location,
										type);
	},
	unregisterSelf: function(aCompMgr, aLocation, aType)
	{
		aCompMgr = aCompMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
		aCompMgr.unregisterFactoryLocation(SYNC2ALL_CID, aLocation);
	},
	getClassObject: function(compMgr, cid, iid) {
		if (!cid.equals(SYNC2ALL_CID))
			throw Components.results.NS_ERROR_NO_INTERFACE;
		if (!iid.equals(Components.interfaces.nsIFactory))
			throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
		return nsSync2allServiceFactory;
	},
	canUnload: function(compMgr) { return true; }
};
var nsSync2allServiceFactory = {
	createInstance: function (aOuter, aIID) {
		if (aOuter != null)
			throw Components.results.NS_ERROR_NO_AGGREGATION;
		if (gSync2all == null){
			gSync2all = new nsSync2allService();
		}
		return gSync2all.QueryInterface(aIID);
	}
};
function NSGetModule() {
	return nsSync2allServiceModule;
}

function NSGetFactory() {
	return nsSync2allServiceFactory;
}
