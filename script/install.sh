#!/bin/bash
script_path=$(cd `dirname $0`;pwd)
start_time=$(date +%s)
echo "项目目录：$root_path"

root_path='/home/work/search/jet';
mkdir -p $root_path
cd $root_path

# 初始

if [ ! -f "$root_path/nodejs/noderuntime/bin/node" ]; then
    mkdir -p nodejs
    cd nodejs
    wget -r -nH --level=0 --cut-dirs=7 getprod@product.scm.baidu.com:/data/prod-64/baidu/third-party/nodejs/nodejs_8-1-4-1_PD_BL/  --user getprod --password getprod --preserve-permissions
    cd output
    tar zxf nodejs.tar.gz
    cd ..
    mv output noderuntime # $root_path/nodejs/noderuntime/bin/node
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
    npm install jet-dev-tool --registry http://pnpm.baidu.com/
fi

cp $script_path/start.sh $root_path
