// PM2 Ecosystem File — Process Manager
// Uses tsx to run TypeScript directly (same as dev, no tsc build needed)
module.exports = {
    apps: [{
        name: 'tramwajewodne-api',
        script: 'node_modules/.bin/tsx',
        args: 'src/index.ts',
        cwd: '/opt/tramwajewodne/server',
        env: {
            NODE_ENV: 'production',
        },
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '256M',
        error_file: '/var/log/tramwajewodne/error.log',
        out_file: '/var/log/tramwajewodne/out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }],
};
