#!/bin/bash
script_path=$(cd `dirname $0`;pwd)
start_time=$(date +%s)
echo "项目目录：$root_path"

root_path='/home/work/search/jet';
mkdir -p $root_path
cd $root_path

# 初始

if [ ! -f "$root_path/nodejs/noderuntime/bin/node" ]; then
    echo "不存在$root_path/nodejs/noderuntime/bin/node， 请执行 install.sh安装"
    exit 2
fi

cd $root_path
mkdir -p public/jetdist
mkdir -p public/jetmap
mkdir -p public/static

###mac下产品库的node跑不来，可以注释掉，用本地的，
nodepath="$root_path/nodejs/noderuntime/bin"
export PATH=$nodepath:$PATH
node -v

which jet
if [[ $? -eq 0 ]];then
    jet --version
else
    echo "不存在jet命令， 请执行 install.sh安装"
fi

node $root_path/jet-dev-tool/bin/jet.js server
