const AWS = require('aws-sdk');
const common = require('/opt/common');
const dynamo = new AWS.DynamoDB.DocumentClient();
const studentAccountTable = process.env.StudentAccountTable;

const encodedStr = rawStr => rawStr.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
    return '&#' + i.charCodeAt(0) + ';';
});

exports.lambdaHandler = async(event, context) => {

    console.log(event);
    if (event.requestContext.http.method === "GET") {
        if (!event.queryStringParameters || !event.queryStringParameters.classroomName) {
            return {
                "headers": {
                    "Content-Type": " text/html"
                },
                "statusCode": 200,
                "body": `
<!DOCTYPE html>
<html>
    <head>
      <title>Managed AWS Educate Classroom Student Account Registration - Error</title>
    </head>
    <body>
        <h2>Invalid Url and it must have classroomName.</h2>
        <footer>
          <p>Developed by <a href="https://www.vtc.edu.hk/admission/en/programme/it114115-higher-diploma-in-cloud-and-data-centre-administration/"> Higher Diploma in Cloud and Data Centre Administration Team.</a></p>
        </footer>
    </body>
</html>
        `
            };
        }
        else {
            let classroomName = encodedStr(event.queryStringParameters.classroomName);
            let params = {
                TableName: studentAccountTable,
                KeyConditionExpression: 'classroomName = :hkey',
                ExpressionAttributeValues: {
                    ':hkey': classroomName
                }
            };

            let students = await dynamo.query(params).promise();
            console.log(students);
            let sts = new AWS.STS();
            const account = (await sts.getCallerIdentity().promise()).Account;
            let trs = students.Items.map(s => ({
                    email: s.email,
                    link: `https://signin.aws.amazon.com/switchrole?account=${s.awsAccountId}&roleName=crossaccountteacher${account}&displayName=${s.email}`
                })).sort((a, b) =>{
                    return a.email.toUpperCase() - b.email.toUpperCase();
                })
                .map(a => `<tr><td>${a.email}</td><td><a href="${a.link}" target="_blank">${a.link}</a></td></tr>`).join('');

            return {
                "headers": {
                    "Content-Type": " text/html"
                },
                "statusCode": 200,
                "body": `
<!DOCTYPE html>
<html>
    <head>
      <title>Managed AWS Educate Classroom Student Cross Account AWS Console Access</title>
    </head>
    <body>
        <h2>Managed AWS Educate Classroom Student Cross Account AWS Console Access - ${classroomName}</h2>
        <table style="width:100%">
          <tr>
            <th>Student Email</th>
            <th>AWS Console Assume Role Url</th>
          </tr>
          ${trs}
        </table>
        <footer>
          <p>Developed by <a href="https://www.vtc.edu.hk/admission/en/programme/it114115-higher-diploma-in-cloud-and-data-centre-administration/"> Higher Diploma in Cloud and Data Centre Administration Team.</a></p>
        </footer>
    </body>
</html>
        `,
            };
        }
    }
};
