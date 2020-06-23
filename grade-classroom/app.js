const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const common = require('/opt/common');

const studentAccountTable = process.env.StudentAccountTable;
const classroomGradeBucket = process.env.ClassroomGradeBucket;


exports.lambdaHandler = async(event, context) => {
    console.log(event);
    let { classroomName, functionName } = event;

    if (event.Records) {
        let snsMessage = await common.getSnsMessage(event);
        if (snsMessage.Source === "Calendar-Trigger") {
            ({ classroomName, functionName } = JSON.parse(snsMessage.desc));
        }
        else {
            let { message, emailBody } = await common.getSesInboxMessage(event);
            classroomName = message.slots.classroomName;
            functionName = emailBody.split('\n')[0].trim();
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
    //console.log(students);
    // console.log(classroomName);
    const awsAccountId = context.invokedFunctionArn.split(":")[4];
    const gradeClassroom = async(email, time) => {

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
            FunctionName: functionName,
            Payload: JSON.stringify(eventArgs),
            InvocationType: "RequestResponse",
        };

        const testResult = await lambda.invoke(params).promise();
        let testReport = JSON.parse(testResult.Payload).testResult;

        testReport = JSON.parse(testReport);
        testReport.classroomName = studentAccount.Item.classroomName;
        testReport.email = studentAccount.Item.email;
        testReport.gradeFunction = functionName;

        await common.putJsonToS3(classroomGradeBucket, classroomName + "/" + functionName + "/" + email + "/" + time + ".json", testReport);

        delete testReport.pending;
        delete testReport.failures;
        delete testReport.passes;
        params = {
            Message: JSON.stringify(testReport),
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

        return testReport;
    };

    console.log("Mark All Student Accounts.");
    const time = getFormattedTime();
    let rawResults = await Promise.all(students.Items.map(s => gradeClassroom(s.email, time)));
    const isEmpty = obj => Object.keys(obj).length === 0;

    const marks = rawResults
        .map(c => ({
            email: c.email,
            tests: c.tests.map(a => ({ test: a.fullTitle.trim(), pass: isEmpty(a.err) }))
        }));


    const results = {
        classroomName,
        gradeFunction: functionName,
        at: new Date(),
        marks
    };

    console.log(results);
    await common.putJsonToS3(classroomGradeBucket, classroomName + "/" + functionName + "/" + "classReport.json", results);
    await common.putJsonToS3(classroomGradeBucket, classroomName + "/" + functionName + "/" + "classReport" + time + ".json", results);

    await generateMarksheet(classroomName, functionName);

    return results;
};

const generateMarksheet = async(classroomName, functionName) => {
    const lsResult = await common.lsS3Objects(classroomGradeBucket, "/" + classroomName + "/" + functionName + "/");
    const markReports = lsResult.files.filter(c => c.includes("classReport"));

    const dailyMarks = await Promise.all(markReports.map(async k => JSON.parse(await common.getS3File(classroomGradeBucket, k))));
    const allTests = dailyMarks.map(c => c.marks).map(c => c.map(a => ({ email: a.email, passedTests: a.tests.filter(a => a.pass).map(a => a.test) })));

    const emailAndpassedTest = allTests.flatMap(testReport => testReport.flatMap(student => student.passedTests.map(c => ({ email: student.email, passedTest: c }))));

    let emailSet = new Set();
    let testSet = new Set();

    emailAndpassedTest.forEach(c => {
        emailSet.add(c.email);
        testSet.add(c.passedTest);
    });
    const emails = Array.from(emailSet).sort();
    const tests = Array.from(testSet).sort();

    const emailTestMark = tests.flatMap(t => emails.map(e => ({ test: t, email: e, mark: emailAndpassedTest.filter(c => c.email === e && c.passedTest === t).length })));

    let marksheets = [];
    let row = [];
    marksheets.push(["email", "mark", ...tests]);
    for (const email of emails) {
        const marks = tests.map(t => emailTestMark.find(c => c.test === t && c.email === email).mark);
        row = [email, marks.reduce((a, b) => a + b, 0), ...marks];
        marksheets.push(row);
    }
    await common.putJsonToS3(classroomGradeBucket, classroomName + "/" + functionName + "/" + "marksheet.json", { marksheets });

    let htmlData = [];
    for (const email of emails) {
        const marks = tests.map(t => ({ test: t.replace(/\W+/g, ""), mark: emailTestMark.find(c => c.test === t && c.email === email).mark }));
        row = { email, mark: marks.reduce((a, b) => a + b.mark, 0) };
        row = Object.assign(row, marks.reduce((prev, curr) => { prev[curr.test] = curr.mark; return prev; }, {}));
        htmlData.push(row);
    }
    const html = `
<!DOCTYPE html>
<html>
<head>
<title>${classroomName} - ${functionName} Cumulative Marksheet</title>
<link href="https://unpkg.com/tabulator-tables@4.7.0/dist/css/tabulator.min.css" rel="stylesheet">
<script type="text/javascript" src="https://unpkg.com/tabulator-tables@4.7.0/dist/js/tabulator.min.js"></script>
</head>
<body>
<h1>${classroomName} - ${functionName} Cumulative Marksheet</h1>
<div id="table"></div>
<script>
let tabledata = ${JSON.stringify(htmlData)};
let table = new Tabulator("#table", {
    data:tabledata,
    autoColumns:true,
});
</script>
</body>
</html>
`;
    await common.putHtmlToS3(classroomGradeBucket, classroomName + "/" + functionName + "/" + "marksheet.html", html);
};

const getFormattedTime = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    const d = today.getDate();
    const h = today.getHours();
    return y + "-" + m + "-" + d + "-" + h;
};
