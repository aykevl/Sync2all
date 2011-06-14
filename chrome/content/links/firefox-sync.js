
// prefix: ffs_

ffs = {};

ffs.username = 'drvsvhqwxqcrakj5745fem647cfwsmt3';
ffs.password = localStorage.ffs_password;

ffs.getpwd = function () {
	if (ffs.password) return ffs.password;
	ffs.password = prompt('Password:');
	localStorage["ffs_password"] = ffs.password;
	return ffs.password;
}

ffs.start = function () {

	// log in
	var xhr = new XMLHttpRequest();

	xhr.open('GET', 'https://auth.services.mozilla.com/user/1.0/'+ffs.username+'/node/weave', true);
	xhr.onload = function () {
		var node_url = xhr.responseText;
		console.log(node_url);
		xhr = new XMLHttpRequest();
		xhr.open('GET', node_url+'1.0/'+ffs.username+'/storage/bookmarks/-UOuT3k7plln', true);
		xhr.setRequestHeader("Authorization", "Basic "+btoa(ffs.username+':'+ffs.getpwd()));
		xhr.onload = function () {
			console.log(xhr.responseText);
		}
		xhr.send();
	}
	xhr.send();
}
