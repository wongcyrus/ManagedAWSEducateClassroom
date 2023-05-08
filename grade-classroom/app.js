const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const common = require('/opt/nodejs/common');
const he = require('he');

const graderParameterTable = process.env.GraderParameterTable;
const studentAccountTable = process.env.StudentAccountTable;
const classroomGradeBucket = process.env.ClassroomGradeBucket;

exports.lambdaHandler = async (event, context) => {
    console.log(event);
    let { classroomName, functionName } = event;

    if (event.Records) {
        let snsMessage = await common.getSnsMessage(event);
        if (snsMessage.Source === "Calendar-Trigger") {
            ({ classroomName, functionName } = JSON.parse(he.decode(snsMessage.desc)));
        }
        else {
            let { message, emailBody } = await common.getSesInboxMessage(event);
            classroomName = message.slots.classroomName;
            functionName = emailBody.split('\n')[0].trim();
        }
    }

    if (!functionName) {
        console.log("Not Grader Event!");
        return "Not Grader Event!";
    }

    let params = {
        TableName: studentAccountTable,
        KeyConditionExpression: 'classroomName = :hkey',
        ExpressionAttributeValues: {
            ':hkey': classroomName
        }
    };

    let students = await dynamo.query(params).promise();
    const gradeClassroom = async (email, time) => {

        let studentAccount = await dynamo.get({
            TableName: studentAccountTable,
            Key: {
                'classroomName': classroomName,
                'email': email
            }
        }).promise();
        console.log(studentAccount);
        let credentials = await common.getCredentials(studentAccount.Item.keyProviderUrl);

        if (!credentials) {
            console.log("credentials error.");
            return;
        }

        try {
            let graderParameter = await dynamo.get({
                TableName: graderParameterTable,
                Key: {
                    'id': classroomName + "#" + functionName + "#" + email,
                }
            }).promise();
            console.log(graderParameter);

            let eventArgs = {
                aws_access_key: credentials.accessKeyId,
                aws_secret_access_key: credentials.secretAccessKey,
                aws_session_token: credentials.sessionToken
            };

            if (graderParameter.Item) {
                eventArgs["graderParameter"] = graderParameter.Item.parameters;
            }

            params = {
                FunctionName: functionName,
                Payload: JSON.stringify(eventArgs),
                InvocationType: "RequestResponse",
            };
            console.log(params);

            const testResult = await lambda.invoke(params).promise();
            let testReport = JSON.parse(testResult.Payload).testResult;

            testReport = JSON.parse(testReport);
            testReport.classroomName = studentAccount.Item.classroomName;
            testReport.email = studentAccount.Item.email;
            testReport.gradeFunction = functionName;
            testReport.awsAccount = studentAccount.Item.awsAccountId;

            await common.putJsonToS3(classroomGradeBucket, classroomName + "/" + functionName + "/" + email + "/" + time + ".json", testReport);

            delete testReport.pending;
            delete testReport.failures;
            delete testReport.passes;
            params = {
                Message: JSON.stringify(testReport),
                TopicArn: studentAccount.Item.notifyStudentTopic
            };
            const sns = new AWS.SNS(credentials);
            const snsResult = await sns.publish(params).promise();
            console.log(snsResult);

            return testReport;
        }
        catch (ex) {
            console.log(ex);
            return undefined;
        }
    };

    console.log("Mark All Student Accounts.");
    const time = getFormattedTime();
    let rawResults = await Promise.all(students.Items.map(s => gradeClassroom(s.email, time)));
    const isEmpty = obj => Object.keys(obj).length === 0;

    const marks = rawResults.filter(c => c !== undefined)
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

const generateMarksheet = async (classroomName, functionName) => {
    const lsResult = await common.lsS3Objects(classroomGradeBucket, "/" + classroomName + "/" + functionName + "/");
    const markReports = lsResult.files.filter(c => c.includes("classReport") && c !== "classReport.json");

    const previousMarkReports = await Promise.all(markReports.map(async k => JSON.parse(await common.getS3File(classroomGradeBucket, k))));
    const allTests = previousMarkReports.map(c => c.marks).map(c => c.map(a => ({ email: a.email, passedTests: a.tests.filter(a => a.pass).map(a => a.test) })));

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
    await common.putCsvToS3(classroomGradeBucket, classroomName + "/" + functionName + "/" + "marksheet.csv", marksheets.map(c => c[0] + "," + c[1]).reduce((c, v) => c + "\n" + v));
    await common.putCsvToS3(classroomGradeBucket, classroomName + "/" + functionName + "/" + "detailed_marksheet.csv", marksheets.map(c => c.join()).join("\r\n"));

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
    <div>
        <a href="marksheet.csv" target="_blank">Download CSV marksheet</a>
    </div>
    <div>
        <a href="detailed_marksheet.csv" target="_blank">Download detailed CSV marksheet</a>
    </div>
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
    const min = today.getMinutes();
    return y + "-" + m + "-" + d + "-" + h + "-" + min;
};
