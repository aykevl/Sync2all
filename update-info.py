#!/usr/bin/env python

import json

manifest = json.load(open('manifest.json', 'r'))

# update firefox meta-file: install.rdf
info_files = \
    {
    'install.rdf':
        {
            'version':     ['em:version>',      '</em:version'],
            'description': ['<em:description>', '</em:descript'],
        },
    'config.xml':
        {
            'version': ['<widget version="', '"'],
            'description': ['<description>', '</description>'],
        }
    }

for (fn, replace) in info_files.items():
    meta_info = open(fn, 'r').read().decode('utf-8')
    for (key, (before, after)) in replace.items():
        start = meta_info.find(before)+len(before)
        end   = meta_info.find(after, start)
        meta_info = meta_info[:start]+manifest[key]+meta_info[end:]
    print meta_info
    open(fn, 'w').write(meta_info.encode('utf-8'))
