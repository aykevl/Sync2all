
function import_browserlink (link) {

	// To call when a bookmark node has been added. The node may be a modified
	// object got with the event.
	link.onCreated = function (node) {
		console.log('evt_onCreated');
		if (node.parentId == link.creating_parentId &&
				(node.url == link.creating_url || node.title == link.creating_title)) {
			delete link.creating_parentId;
			delete link.creating_url;
			delete link.creating_title;
			return;
		}
		if (node.id in link.ids) return; // already tracked
		if (!link.ids[node.parentId]) return; // not in the synced folder
		var parentNode = link.ids[node.parentId];
		if (node.url) {
			// bookmark
			console.log('Created new bookmark: '+node.url);
			var bookmark = {title: node.title, url: node.url, parentNode: parentNode, mtime: node.mtime, id: node.id};
			link.ids[node.id] = bookmark;
			if (addBookmark(link, bookmark)) return; // error
		} else {
			// folder
			console.log('Created new empty folder: '+node.title);
			var folder = {title: node.title, mtime: node.mtime, parentNode: parentNode, bm: {}, f: {}, id: node.id};
			link.ids[node.id] = folder;
			addFolder(link, folder);
		}
		commit();
	}
}
