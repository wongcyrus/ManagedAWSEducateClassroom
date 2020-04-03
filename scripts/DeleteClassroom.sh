DeleteClassroomFunction=$(aws cloudformation describe-stacks --stack-name serverlessrepo-managed-aws-educate-classroom \
--query 'Stacks[0].Outputs[?OutputKey==`DeleteClassroomFunction`].OutputValue' --output text)

echo "Delete Classroom."
aws lambda invoke \
    --function-name $DeleteClassroomFunction \
    --payload file://DeleteClassroom.json \
    DeleteClassroomResponse.json