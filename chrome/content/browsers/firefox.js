
var fx = {
	shortname: 'fx',
	name: 'Mozilla Firefox',

	init: function () {
		fx.historyService = Components.classes["@mozilla.org/browser/nav-history-service;1"]
		                              .getService(Components.interfaces.nsINavHistoryService);
		fx.bmsvc = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"]
		                     .getService(Components.interfaces.nsINavBookmarksService);
		fx.ios = Components.classes["@mozilla.org/network/io-service;1"]
		                    .getService(Components.interfaces.nsIIOService);
	},

	start: function () {
		fx.bookmarks = {bm: {}, f: {}, id: fx.bmsvc.toolbarFolder};
		fx.getTree();
		target_finished(fx);
	},

	getTree: function () {
		fx.getSubTree(fx.bookmarks);
	},
	
	getSubTree: function (folder) {
		// https://developer.mozilla.org/en/Retrieving_part_of_the_bookmarks_tree
		var options = fx.historyService.getNewQueryOptions();
		var query = fx.historyService.getNewQuery();

		query.setFolders([folder.id], 1);

		var result = fx.historyService.executeQuery(query, options);
		var fx_folder = result.root;

		// open the folder first
		fx_folder.containerOpen = true;

		// iterate over the immediate children of this folder
		for (var i=0; i<fx_folder.childCount; i++) {
			var node = fx_folder.getChild(i);
			if (node.type == node.RESULT_TYPE_FOLDER) {
				var subfolder = {title: node.title, id: node.itemId,
					bm: {}, f: {}};
				folder.f[subfolder.title] = subfolder;
				fx.getSubTree(subfolder);
			} else if (node.type == node.RESULT_TYPE_URI) {
				var bm = {title: node.title, id: node.itemId, url: node.uri};
				folder.bm[node.uri] = bm;
			}
		}

		// close a container after using it!
		fx_folder.containerOpen = false;
	},
	
	f_add: function (link, folder) {
		folder.id = fx.bmsvc.createFolder(folder.parentNode.id, folder.title, fx.bmsvc.DEFAULT_INDEX)
	},

	bm_add: function (link, bm) {
		var uri = fx.ios.newURI(bm.url, null, null);
		bm.id = fx.bmsvc.insertBookmark(bm.parentNode.id, uri, fx.bmsvc.DEFAULT_INDEX, bm.title);
	},
}

use_target(fx);
