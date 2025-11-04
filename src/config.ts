/**
 * 配置加载模块
 * 必须在所有其他模块之前导入，确保环境变量正确加载
 */
import dotenv from 'dotenv';

// 立即加载环境变量
dotenv.config();

// 验证必需的环境变量
if (!process.env.JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is not set. ' +
    'Generate one with: openssl rand -base64 32'
  );
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error(
    'FATAL: JWT_SECRET must be at least 32 characters long for security. ' +
    'Generate one with: openssl rand -base64 32'
  );
}

// 导出配置
export const config = {
  // 安全配置
  jwtSecret: process.env.JWT_SECRET,

  // 服务器配置
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // 数据库配置
  dbPath: process.env.DB_PATH || './data.db',

  // CORS配置
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // 调试配置
  debugCfApi: process.env.DEBUG_CF_API === 'true' && process.env.NODE_ENV !== 'production',
} as const;

// 配置验证日志
console.log('✅ Configuration loaded successfully');
console.log(`   Environment: ${config.nodeEnv}`);
console.log(`   Port: ${config.port}`);
console.log(`   Database: ${config.dbPath}`);
console.log(`   JWT Secret: ${config.jwtSecret.substring(0, 8)}... (${config.jwtSecret.length} chars)`);
