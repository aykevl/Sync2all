var SYNC2ALL_CONTRACTID = '@github.com/sync2all;1';
var SYNC2ALL_CID = Components.ID('{5d20fa2b-38c7-4167-b8f5-d9f26bcbb1bc}');
var SYNC2ALL_IID = Components.interfaces.nsISync2allService;

var SYNC2ALL_SOURCES = [

  // Generic libraries
  'chrome://sync2all/content/globals.js',
  'chrome://sync2all/content/utils.js',

  // Firefox-specific library (to let it use webstandards in XPCOM
  'chrome://sync2all/content/browsers/firefox-fixes.js',

  // Specific libraries
  'chrome://sync2all/content/oauth.js',
  'chrome://sync2all/content/sha1.js',
  'chrome://sync2all/content/operalink.js',
  'chrome://sync2all/content/link.js',
  'chrome://sync2all/content/link_tagBased.js',
  'chrome://sync2all/content/link_treeBased.js',
  'chrome://sync2all/content/browserlink.js',
  'chrome://sync2all/content/tagtree.js',

  // links
  'chrome://sync2all/content/browsers/firefox.js',
  'chrome://sync2all/content/links/google-bookmarks.js',
  'chrome://sync2all/content/links/opera-link.js',

  // sync engine
  'chrome://sync2all/content/sync2all.js',
];

const loader = Components.classes['@mozilla.org/moz/jssubscript-loader;1']
              .getService(Components.interfaces.mozIJSSubScriptLoader);

var gSync2all;

function nsSync2allService() {
  //Who needs interfaces anyway
  this.wrappedJSObject = this;
  this.strbundle = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService)
      .createBundle("chrome://sync2all/locale/sync2all.properties");
  gSync2all=this;
  try{
    var combundle = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService)
       .createBundle("chrome://sync2all/locale/com.properties");
    this.mode=combundle.GetStringFromName("identifier");
  } catch(e){
    this.mode="google";
  }
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
  }
};

var Sync2all_source;
for (var i=0; Sync2all_source=SYNC2ALL_SOURCES[i]; i++) {
	loader.loadSubScript(Sync2all_source, nsSync2allService.prototype);
}

// Start sync after a while (1 second)
// https://developer.mozilla.org/en/NsITimer#Example
// TODO do this in the startup-notifications
var Sync2all_event = {
	notify: function (timer) {
		nsSync2allService.prototype.onLoad();
	}
}
var timer = Components.classes["@mozilla.org/timer;1"]
           .createInstance(Components.interfaces.nsITimer);
timer.initWithCallback(Sync2all_event, 1000,
		Components.interfaces.nsITimer.TYPE_ONE_SHOT);

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
  createInstance: function (aOuter, aIID)
  {
  if (aOuter != null)
    throw Components.results.NS_ERROR_NO_AGGREGATION;
  if (gSync2all == null){
    gSync2al = new nsSync2allService();
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
