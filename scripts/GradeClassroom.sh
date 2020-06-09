GradeClassroomFunction=$(aws cloudformation describe-stacks --stack-name serverlessrepo-managed-aws-educate-classroom \
--query 'Stacks[0].Outputs[?OutputKey==`GradeClassroomFunction`].OutputValue' --output text)

echo "Grade Classroom."
aws lambda invoke \
    --function-name $GradeClassroomFunction \
    --payload file://GradeClassroom.json \
    GradeClassroomResponse.json