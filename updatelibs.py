#!/usr/bin/env python

files = {
    'operalink.js': 'https://github.com/aykevl93/OperaLink.js/raw/master/src/script/operalink.js',
    'oauth.js':     'https://github.com/ChaosinaCan/OperaLink.js/raw/master/build/oauth.js',
    'sha1.js':      'https://github.com/ChaosinaCan/OperaLink.js/raw/master/build/sha1.js',
}

import urllib
for (file, url) in files.items():
    print 'Fetching: '+url
    open(file, 'w').write(urllib.urlopen(url).read())

