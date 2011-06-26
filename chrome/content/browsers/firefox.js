
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
		fx.ids = {};
		fx.ids[fx.bookmarks.id] = fx.bookmarks;
		fx.getTree();

		// add myself as observer
		fx.bmsvc.addObserver(fx, false);

		target_finished(fx);
	},

	stop: function () {
		// remove myself as observer when I don't need to know the changes
		fx.bmsvc.removeObserver(fx);
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
				if (folder.f[node.title]) {
					// duplicate
					// TODO move contents to old folder
					continue;
				}
				var subfolder = {title: node.title, id: node.itemId,
					bm: {}, f: {}, parentNode: folder};
				folder.f[subfolder.title] = subfolder;
				fx.ids[subfolder.id] = subfolder;
				fx.getSubTree(subfolder);
			} else if (node.type == node.RESULT_TYPE_URI) {
				if (folder.bm[node.uri]) {
					// duplicate
					fx.bmsvc.removeItem(node.itemId);
					continue;
				}
				var bm = {title: node.title, id: node.itemId, url: node.uri, parentNode: folder};
				folder.bm[node.uri] = bm;
				fx.ids[bm.id] = bm;
			}
		}

		// close a container after using it!
		fx_folder.containerOpen = false;
	},

	// Observer notifications

	onItemRemoved: function (id) {
		if (!fx.ids[id]) return;
		var node = fx.ids[id];
		delete fx.ids[id];
		rmNode(fx, node);
		commit();
	},
	onBeginUpdateBatch:  function ()
	{	
		update_batch = true;
	},
	onEndUpdateBatch:    function ()
	{
		update_batch = false;
		commit();
	},
	onBeforeItemRemoved: function (){},
	onItemChanged:       function (){},
	onItemAdded:         function (id, parentId, index, type, uri, title) {
		if (!title) {
			// gecko < 6
			title = fx.bmsvc.getItemTitle(id);
		}
		if (!fx.ids[parentId]) return; // not here added
		if (type == fx.bmsvc.TYPE_BOOKMARK) {
			var url = uri.resolve('');
			console.log('url: '+url);
			var bm = {url: url, title: title, id: id, parentNode: fx.ids[parentId]};
			fx.ids[bm.id] = bm;
			addBookmark(fx, bm);
		} else if (type == fx.bmsvc.TYPE_FOLDER) {
			var folder = {title: title, bm: {}, f: {},
				parentNode: fx.ids[parentId], id: id};
			fx.ids[folder.id] = folder;
			addFolder(fx, folder);
		}
		commit();
	},
	onItemChanged: function (id, property, is_annotation, newValue) {
		if (!fx.ids[id]) return; // not our item
		if (!property) return;
		console.log(fx.ids[id].title+' changed property '+property+' to '+newValue);
	},
	onItemMoved: function (id, oldParent, oldIndex, newParent, newIndex, type) {
		console.log('onItemMoved');
		if (!fx.ids[newParent]) return; // not moved into a place that is synchronized
		console.log('newParent known');
		if (!fx.ids[id]) {
			// moved to a synchronized folder
			if (type == fx.bmsvc.TYPE_BOOKMARK) {
				console.log('fx: bookmark moved into synchronized tree');
				var url = fx.bmsvc.getBookmarkURI(id).resolve(null);
				var bm = {title: fx.bmsvc.getItemTitle(id), url: url, 
					parentNode: fx.ids[newParent], id: id};
				fx.ids[bm.id] = bm;
				addBookmark(fx, bm);
			} else if (type == fx.bmsvc.TYPE_FOLDER) {
				console.log('fx: folder moved into synchronized tree');
				var folder = {title: fx.bmsvc.getItemTitle(id),
					bm: {}, f: {}, parentNode: fx.ids[oldParent], id: id};
				// FIXME childs...
				fx.ids[folder.id] = folder;
				addFolder(fx, folder);
			}
		} else {
			if (!fx.ids[oldParent]) {
			}
		}
		commit();
	 },
	onItemReplaced: function () {
		// TODO
	},
	onItemVisited: function () {},
	
	// functions so other links can post changes to here

	f_add: function (link, folder) {
		folder.id = fx.bmsvc.createFolder(folder.parentNode.id, folder.title, fx.bmsvc.DEFAULT_INDEX)
		fx.ids[folder.id] = folder;
	},

	bm_add: function (link, bm) {
		var uri = fx.ios.newURI(bm.url, null, null);
		bm.id = fx.bmsvc.insertBookmark(bm.parentNode.id, uri, fx.bmsvc.DEFAULT_INDEX, bm.title);
		fx.ids[bm.id] = bm;
	},
	bm_del: function (link, bm) {
		delete fx.ids[bm.id];
		fx.bmsvc.removeItem(bm.id);
	},
	commit: false, // not needed in firefox
	finished_sync: false,
}

use_target(fx);
