/**
 * @file 工具
 * @author kaivean
 */

const path = require('path');
const program = require('commander');
const config = require('./config');

let {commandDir, commands} = config;

// 定义脚手架的node模块路径
process.env.NODE_PATH = path.join(__dirname, '../node_modules');

// 通过 export  NODE_ENV='development'  模拟
// process.env.NODE_ENV = 'development';

// 定义当前版本
program
    .version(require('../package').version);

// 定义使用方法
program
    .usage('<command> [options] <args ...>');

// 绑定执行命令
if (commands) {
    for (let commandName of Object.keys(commands)) {
        let cmd = commands[commandName];

        let chain = program.command(cmd.command)
            .description(cmd.desc || 'Ala command ' + commandName)
            .action(async () => {
                let args = program.args; // 获得build后面的参数，不包括加--形式的参数

                // 最后一个command对象，包含options信息，不用pop，不去改变人家的program.args
                let option = args[args.length - 1]; // 例：ala build --type <卡片, ...卡片>, option = {type: true}

                // 最后一个command对象要去掉
                args = args.slice(0, -1); //  举例： ala build <卡片, ...卡片> , args就是所有卡片数组
                args = args[0];
                if (typeof args === 'string') {
                    args = [args];
                }
                try {
                    await require('../' + commandDir + '/' + commandName)(option, args, program);
                }
                catch (e) {
                    console.error(e);
                }
            });

        for (let optName of Object.keys(cmd.options)) {
            let opt = cmd.options[optName];
            chain
                .option(opt.param, opt.desc);
        }
    }
}

// 运行命令
program
    .parse(process.argv);

if (!program.args.length) {
    program.help();
}
