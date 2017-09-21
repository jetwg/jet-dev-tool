/**
 * @file entry
 * @author kaivean
 */

const jet = require('jet-analyser');
const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');

const server = require('./server/index');

let defaultConf = {
    root: path.resolve(__dirname, '..', 'output', 'static', 'newzhaopin'),
    jsCodeDir: path.resolve(__dirname, '..', 'output', 'static', 'jet', 'code'),
    mapCodeDir: path.resolve(__dirname, '..', 'output', 'static', 'jet', 'conf')
};

let chokidarOpt = {
    ignoreInitial: true,
    ignored: []
};

function compileAll(options) {

    let result = jet.walk({
        srcDir: path.join(options.root),
        distDir: path.join(options.root, '..', 'jet', 'code'),
        baseId: './',
        useHash: false,
        analyserConfig: {
            amdWrapper: false,
            beautify: false  // 【可选】是否格式化代码
        }
    });

    let confPath = path.join(options.root, '..', 'jet', 'conf');
    fs.ensureDirSync(confPath);
    console.log('options.root', options.root, confPath);
    let modResult = {};
    for (let item of result) {
        let defines = item.defines;
        for (let moduleId of Object.keys(defines)) {
            let moduleName = moduleId.split('/')[0];
            console.log('moduleName', moduleName);
            if (!modResult.hasOwnProperty(moduleName)) {
                modResult[moduleName] = [];
            }
            modResult[moduleName].push(item);
        }
    }

    for (let moduleName of Object.keys(modResult)) {

        // 输出json conf
        let jsonConf = {};
        for (let item of modResult[moduleName]) {
            let defines = item.defines;
            for (let moduleId of Object.keys(item.defines)) {
                let define = defines[moduleId];

                jsonConf[moduleId] = {
                    p: item.dist,
                    d: define.depends,
                    a: define.requires
                };
            }
        }

        fs.writeFileSync(path.join(confPath, moduleName + '.conf.json'), JSON.stringify(jsonConf, null, 4));
    }
}

function compileSingle(code, subpath, options) {
    let baseId = subpath.replace(/^\//, '').replace('\.js', '');
    let result = jet.analyse({
        code: code,
        baseId: baseId,
        amdWrapper: false,
        beautify: false  // 【可选】是否格式化代码
    });

    let confPath = path.join(options.root, '..', 'jet', 'conf');
    fs.ensureDirSync(confPath);
    let modResult = {};
    let item = result;
    let defines = item.defines;
    for (let moduleId of Object.keys(defines)) {
        let moduleName = moduleId.split('/')[0];
        console.log('moduleName', moduleName);
        if (!modResult.hasOwnProperty(moduleName)) {
            modResult[moduleName] = [];
        }
        modResult[moduleName].push(item);
    }
    console.log('result', baseId, subpath,  result, defines);
    console.log('modResult', modResult);
    for (let moduleName of Object.keys(modResult)) {
        // 输出json conf
        let jsonConf = {};
        for (let item of modResult[moduleName]) {
            let defines = item.defines;
            for (let moduleId of Object.keys(item.defines)) {
                let define = defines[moduleId];

                jsonConf[moduleId] = {
                    p: item.dist,
                    d: define.depends,
                    a: define.requires
                };
            }
        }

        // 单个编译会去更新配置
        let jsonPath = path.join(confPath, moduleName + '.conf.json');
        let allConf = {};
        if (fs.existsSync(jsonPath)) {
            delete require.cache[jsonPath];
            allConf = require(jsonPath);
        }
        jsonConf = Object.assign({}, allConf, jsonConf);
        console.log('jsonConf', jsonConf);
        fs.writeFileSync(jsonPath, JSON.stringify(jsonConf, null, 4));

        let distDir = path.join(options.root, '..', 'jet', 'code');
        let distFile = path.join(distDir, subpath);


        fs.writeFileSync(distFile, result.output);
    }
}

module.exports = {
    async start(options = defaultConf) {

        compileAll(options);

        // 启动server
        server.start(options);

        // 监控项目文件的改动
        chokidar.watch(path.join(options.root, '**.js'), chokidarOpt).on('all', async (event, thePath) => {
            /* eslint-disable fecs-prefer-destructure */
            let subpath = thePath.replace(options.root, '');
            let code = fs.readFileSync(thePath, 'utf8');
            console.log(event, thePath, subpath);
            compileSingle(code, subpath, options);
            console.log(thePath, ' compiled!');
            // thePath.replace(listenDir, '') = /app/atom_local_item/index.atom

            // let code = fs.readFileSync(thePath, 'utf8');
            //
            // let tplType = arr[1];
            // let tplName = arr[2];
            //
            // // 告知客户端，正在编译
            // hotreload.triggerCompile();
            //
            // try {
            //     await buildAction.run({
            //         projectDir: state.projectDir,
            //         mod: state.mod,
            //         outputType: 'local',
            //         buildType: 'dev', // dev, prod
            //         compress: false,
            //         clean: true,
            //         tpls: [
            //             {
            //                 type: tplType,
            //                 name: tplName
            //             }
            //         ]
            //     });
            //     log.info('构建完成');
            // }
            // catch (e) {
            //     console.log(e);
            // }
            //
            // // 告知客户端，编译完成，刷新页面
            // hotreload.triggerReload();
        });



    }
};

module.exports .start();
