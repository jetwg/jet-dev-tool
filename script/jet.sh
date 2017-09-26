#!/bin/bash

##
## 使用: sh jet.sh server -a
##
script_path=$(cd `dirname $0`;pwd)
start_time=$(date +%s)
echo "项目目录：$root_path"

root_path='/home/work/search/jet';
mkdir -p $root_path/public/static
cd $root_path


nodepath="$root_path/nodejs/noderuntime/bin"
export PATH=$nodepath:$PATH
node -v

node $root_path/jet-dev-tool/bin/jet.js --path=$root_path/public/static $*
