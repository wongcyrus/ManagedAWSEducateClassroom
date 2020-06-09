const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const common = require('/opt/common');

const studentAccountTable = process.env.StudentAccountTable;


exports.lambdaHandler = async(event, context) => {
    console.log(event);
    let { classroomName } = event;

    if (!classroomName && event.Records) {
        let snsMessage = await common.getSnsMessage(event);
        if (snsMessage.Source === "Calendar-Trigger") {
            ({ classroomName } = JSON.parse(snsMessage.desc));
        }
        else {
            let { message } = await common.getSesInboxMessage(event);
            classroomName = message.slots.classroomName;
        }
    }

    let params = {
        TableName: studentAccountTable,
        KeyConditionExpression: 'classroomName = :hkey',
        ExpressionAttributeValues: {
            ':hkey': classroomName
        }
    };

    let students = await dynamo.query(params).promise();
    console.log(students);
    console.log(classroomName);
    const awsAccountId = context.invokedFunctionArn.split(":")[4];
    const gradeClassroom = async email => {

        let studentAccount = await dynamo.get({
            TableName: studentAccountTable,
            Key: {
                'classroomName': classroomName,
                'email': email
            }
        }).promise();
        console.log(studentAccount);

        const sts = new AWS.STS();
        const token = await sts.assumeRole({
            RoleArn: `arn:aws:iam::${studentAccount.Item.awsAccountId}:role/crossaccountteacher${awsAccountId}`,
            RoleSessionName: 'studentAccount'
        }).promise();

        const eventArgs = {
            aws_access_key: token.Credentials.AccessKeyId,
            aws_secret_access_key: token.Credentials.SecretAccessKey,
            aws_session_token: token.Credentials.SessionToken,
        };

        params = {
            FunctionName: "cloudprojectmarker-CloudProjectMarkerFunction-EBTPD9NF2O6A",
            Payload: JSON.stringify(eventArgs),
            InvocationType: "RequestResponse",
        };

        const testResult = await lambda.invoke(params).promise();
        const xunitTestReport = JSON.parse(testResult.Payload).testResult;
        params = {
            Message: xunitTestReport,
            TopicArn: studentAccount.Item.notifyStudentTopic
        };
        const sns = new AWS.SNS({
            accessKeyId: token.Credentials.AccessKeyId,
            secretAccessKey: token.Credentials.SecretAccessKey,
            sessionToken: token.Credentials.SessionToken,
            region: "us-east-1"
        });
        const snsResult = await sns.publish(params).promise();
        console.log(snsResult);

        return xunitTestReport;
    };

    console.log("Mark All Student Accounts.");
    let result = students.Items.map(s => gradeClassroom(s.email));
    console.log(await Promise.all(result));

    return "OK";
};
