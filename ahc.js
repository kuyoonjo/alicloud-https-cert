const configFile = process.argv[2] || (__dirname + '/ahc.json');
const config = JSON.parse(require('fs').readFileSync(configFile).toString());

console.log('subDomains:', config.subDomains);

const subDomains = config.subDomains;
const baseDomain = config.baseDomain;
const acme_path = config.acme_path;
const accessKeyId = config.accessKeyId;
const accessKeySecret = config.accessKeySecret;
const endpoint = 'https://' + config.endpoint;
const apiVersion = '2015-01-09';

const { execSync } = require('child_process');
const Core = require('@alicloud/pop-core');

const client = new Core({
  accessKeyId,
  accessKeySecret,
  endpoint,
  apiVersion,
});

async function getRecord(domain) {
  try {
    const params = {
      subDomain: `${domain.replace('*', '_acme-challenge')}.${baseDomain}`
    };
    const res = await client.request('DescribeSubDomainRecords', params);
    return res.DomainRecords.Record[0];
  } catch (e) {
    console.error(e)
  }
}

async function updateDomainRecord(record, value) {
  const params = {
    recordId: record.RecordId,
    domainName: record.DomainName,
    RR: record.RR,
    type: record.Type,
    value,
    TTL: record.TTL,
    priority: 1,
    line: record.Line,
  };
  await client.request('UpdateDomainRecord', params);
}

(async () => {
  for (const domain of subDomains) {
    const record = await getRecord(domain);
    if (!record) {
      console.log('Failed to get record');
      return;
    }
    console.log('RR:', record.RR);
    console.log('RecordId:', record.RecordId);
    try {
      const cmd = `${acme_path} --server letsencrypt --issue --force -d '${domain}.${baseDomain}' --dns --yes-I-know-dns-manual-mode-enough-go-ahead-please`;
      console.log(cmd);
      const res = execSync(cmd);
      console.log(res.toString());
    } catch (err) {
      const m = err.stdout.toString().match(/TXT\s+value:\s+'(?<value>.*?)'/);
      if (!m || !m.groups || !m.groups.value) {
        console.log('Failed to get TXT Value');
        return;
      }
      console.log('TXT Value:', m.groups.value);
      try {
        await updateDomainRecord(record, m.groups.value);
        const cmd = `${acme_path} --renew -d '${domain}.${baseDomain}' --yes-I-know-dns-manual-mode-enough-go-ahead-please`;
        console.log(cmd);
        execSync(cmd, { stdio: 'inherit' });
      } catch (e) {
        if (e) {
          if (e.stdout && e.stdout.toString) {
            console.log(e.stdout.toString());
          }
          if (e.stderr && e.stderr.toString) {
            console.log(e.stderr.toString());
          }
        }
      }
    }
  }
})();
