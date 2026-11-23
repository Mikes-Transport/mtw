#!/usr/bin/env node
// Local-only credential provisioning for MTWStudio D1.
// Never commit the SQL output: it contains an initial manager secret or a host key hash.
import { pbkdf2Sync, randomBytes, randomUUID, createHash } from 'node:crypto';

const [type, ...args] = process.argv.slice(2);
const escape = value => "'" + value.replaceAll("'", "''") + "'";
const sha256 = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
const usage = () => {
  process.stderr.write('Usage: node provision.mjs manager <email> <display-name> OR node provision.mjs host <computer-name>\n');
  process.exitCode = 2;
};
if (type === 'manager' && args.length === 2) {
  const [email, name] = args;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.trim().length < 1 || name.length > 100) usage();
  else {
    const password = random();
    const salt = randomBytes(16).toString('hex');
    const iterations = 240000;
    const hash = pbkdf2Sync(password, Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex');
    console.log('MANAGER USERNAME: ' + email.toLowerCase());
    console.log('ONE-TIME PASSWORD: ' + password);
    console.log('SQL (execute privately against MTWStudio D1):');
    console.log('INSERT INTO users (id,email,name,role,password_salt,password_hash,password_iterations,enabled) VALUES (' +
      [randomUUID(), email.toLowerCase(), name, 'manager', salt, hash].map(escape).join(',') + ',' + iterations + ',1);');
  }
} else if (type === 'host' && args.length === 1 && args[0].trim().length && args[0].length <= 100) {
  const key = random();
  console.log('HOST ACCESS KEY (enter this in MTWStudio Host): ' + key);
  console.log('SQL (execute privately against MTWStudio D1):');
  console.log('INSERT INTO hosts (id,label,agent_key_hash,enabled,connection_mode) VALUES (' +
    [randomUUID(), args[0], sha256(key)].map(escape).join(',') + ",1,'code');");
} else usage();
