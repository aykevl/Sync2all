/*sync2all.onFirefoxLoad = function(event) {
  document.getElementById("contentAreaContextMenu")
          .addEventListener("popupshowing", function (e){ sync2all.showFirefoxContextMenu(e); }, false);
};*/

/*sync2all.showFirefoxContextMenu = function(event) {
  // show or hide the menuitem based on what the context menu is on
  document.getElementById("context-sync2all").hidden = gContextMenu.onImage;
};*/

//window.addEventListener("load", function () { sync2all.onFirefoxLoad(); }, false);

// get the global 'background page'
var Sync2allService = Components
	.classes['@github.com/sync2all;1']
	.getService(Components.interfaces.nsISync2allService).wrappedJSObject;
