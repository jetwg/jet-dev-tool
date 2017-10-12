/**
 * @file 工具的命令配置文件
 * @author kaivean
 */

module.exports = {

    commandDir: './command',
    commands: {
        init: {
            command: 'init',
            desc: '初始化项目',
            options: [
                // {
                //     param: '-f, --force',
                //     desc: '强制重新初始化'
                // }
            ]
        },
        build: {
            command: 'build [模板名...]',
            desc: '构建项目',
            options: [
                {
                    param: '-p, --path <path>',
                    desc: '包所在目录地址，默认（shell当前路径）'
                },
                {
                    param: '-d, --dist <dist>',
                    desc: '编译代码输出路径(default: ${src}/../jetdist) '
                },
                {
                    param: '-m, --map <map>',
                    desc: '映射配置文件输出路径(default: ${dist}/../jetmap)'
                },
                {
                    param: '-h, --hash <hash>',
                    desc: '加hash(default: true)'
                },
                {
                    param: '-b, --beautify',
                    desc: '输出不压缩代码(default: false)'
                },
                {
                    param: '-c, --clean',
                    desc: '先清空dist 和 map两个输出目录(default: false)'
                },
                {
                    param: '-a, --all',
                    desc: '当前目录下所有子目录都当成包来监听'
                }
            ]
        },
        server: {
            command: 'server',
            desc: '启动本地调试服务器',
            options: [
                {
                    param: '-a, --all',
                    desc: '当前目录下所有子目录都当成包来监听'
                },
                {
                    param: '-p, --path <path>',
                    desc: '服务器监听的包路径 或者 多个包的上级路径需要加-a参数'
                },
                {
                    param: '--port <port>',
                    desc: '启动server端口'
                },
                {
                    param: '-h, --host <host>',
                    desc: 'Jet服务地址 ,建议配置线下'
                },
                {
                    param: '-d, --dist <dist>',
                    desc: '编译代码输出路径(default: ${src}/../.jettmp/jetdist) '
                },
                {
                    param: '-m, --map <map>',
                    desc: '映射配置文件输出路径(default: ${src}/../.jettmp/jetmap)'
                }
            ]
        }
    }
};
