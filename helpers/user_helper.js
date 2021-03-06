const db = require('../configs/connection')
const bcrypt = require('bcrypt')
const collection = require('../configs/collection')
const nodeMailer = require('./nodeMailer')
const crypto = require('crypto')
const Helper = require('./Helper')
const { ObjectId } = require('mongodb')
const { resolve } = require('path')
const { reject } = require('promise')

module.exports = {
    getUserByEmailForLogin: (email, callback) => {
        db.get().collection(collection.USER_COLLECTION).findOne({ email: email }).then((response) => {
            callback(null, response)
        }).catch((response) => {
            callback(response, null)
        })
    },
    comparePassword: (candidatePassword, hashPassword, callback) => {
        bcrypt.compare(candidatePassword, hashPassword, (err, isMatch) => {
            callback(err, isMatch)
        })
    },
    getUserById: (id, callback) => {
        db.get().collection(collection.USER_COLLECTION).findOne({ _id: ObjectId(id) }).then((response) => {
            callback(null, response)
        }).catch((response) => {
            callback(response, null)
        })
    },
    useRegistration: (data, domine) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.REGISTRATION_COLLECTION)
                .findOne({ '$or': [{ email: data.email }, { mobile: parseInt(data.mobile) }] })
                .then(async (response) => {
                    if (response == null) {
                        let token = crypto.randomBytes(20)
                        token = token.toString('hex')
                        data.password = await bcrypt.hash(data.password, 10)
                        db.get().collection(collection.REGISTRATION_COLLECTION)
                            .insertOne({
                                name: data.name.toUpperCase(),
                                email: data.email,
                                mobile: parseInt(data.mobile),
                                batchId: parseInt(data.batch),
                                genderId: parseInt(data.gender),
                                dateOfBirth: new Date(data.dateOfBirth),
                                password: data.password,
                                emailVerificationToken: token,
                                emailVerificationStatus: false,
                                submissionTime: Date.now()
                            }).then(() => {
                                nodeMailer({
                                    recipient: data.email,
                                    subject: "Scholarship Registration",
                                    message: "Registration Successful\n\nclick this link to verify email" +
                                        ' https://' + process.env.domaine + '/verify-email/' + token + '\n\n'
                                })
                                resolve('please check email to complete registration')
                            })
                    } else {
                        reject('Email or Mobile No Already Used')
                    }
                }).catch(err => {
                    reject(err)
                })
        })
    },
    verifyEmail: (token) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.REGISTRATION_COLLECTION).findOne({ emailVerificationToken: token }).then(response => {
                if (response) {
                    function addNewUser(data) {
                        return new Promise((resolve, reject) => {
                            db.get().collection(collection.USER_COLLECTION).updateOne(
                                { 'email': data.email },
                                {
                                    "$set": {
                                        _id: ObjectId(data._id),
                                        name: data.name.toUpperCase(),
                                        genderId: parseInt(data.genderId),
                                        email: data.email,
                                        mobile: parseInt(data.mobile),
                                        dob: new Date(data.dateOfBirth),
                                        password: data.password,
                                        batchId: parseInt(data.batchId),
                                        type: 'user'
                                    }
                                },
                                { upsert: true }).then(() => {
                                    resolve()
                                }).catch(err => {
                                    reject(err)
                                })
                        })
                    }
                    function updateRegistrationStatus(email) {
                        return new Promise((resolve, reject) => {
                            db.get().collection(collection.REGISTRATION_COLLECTION).updateOne({ email: email }, { "$set": { "emailVerificationStatus": true } }).then((response) => {
                                resolve()
                            }).catch(err => {
                                reject(err)
                            })
                        })
                    }
                    Promise.all([addNewUser(response), updateRegistrationStatus(response.email)]).then(() => {
                        resolve('Email Verified')
                    }).catch(err => {
                        reject(err)
                    })
                } else {
                    reject('User not Found or Token is invalid')
                }
            }).catch(err => {
                reject(err)
            })
        })
    },
    getGenders: () => {
        return new Promise((reslove, reject) => {
            db.get().collection(collection.GENDER_COLLECTION).find().toArray()
                .then(response => {
                    reslove(response);
                }).catch(err => {
                    reject(err)
                })
        })
    },
    getUserByEmail: (email) => {
        return new Promise(async (resolve, reject) => {
            let user = await db.get().collection(collection.USER_COLLECTION).findOne({ email: email })
            if (user)
                resolve(user)
            else
                reject('User not Found')
        })
    },
    getDepartments: () => {
        return new Promise(async (resolve, reject) => {
            db.get().collection(collection.DEPARTMENTS_COLLECTION).find().toArray()
                .then(response => {
                    resolve(response)
                }).catch(err => {
                    reject(err)
                })
        })
    },
    getCoursesByDeptId: (id) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.COURSES_COLLECTION).find({ DEPARTMENTID: id }).toArray()
                .then(response => {
                    resolve(response);
                }).catch(err => {
                    reject(err)
                })
        })
    },
    getBatchByCoursesId: (id) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.BATCHES_COLLECTION).
                aggregate([
                    {
                        "$match": {
                            "$and": [
                                {
                                    "COURSEID": parseInt(id)
                                },
                                {
                                    "STARTDATE": { "$lte": new Date() }
                                },
                                {
                                    "LASTDATE": { "$gte": new Date() }
                                }
                            ]
                        }
                    },

                ])
                .toArray()
                .then(response => {
                    resolve(response);
                }).catch(err => {
                    reject(err)
                })
        })
    },
    getDeptAndCourseAndBatchByBatchId: (batchId) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.BATCHES_COLLECTION)
                .aggregate([
                    {
                        '$match': {
                            'ID': parseInt(batchId)
                        }
                    }, {
                        '$lookup': {
                            'from': 'courses',
                            'localField': 'COURSEID',
                            'foreignField': 'ID',
                            'as': 'course'
                        }
                    }, {
                        '$unwind': {
                            'path': '$course'
                        }
                    }, {
                        '$lookup': {
                            'from': 'departments',
                            'localField': 'course.DEPARTMENTID',
                            'foreignField': 'ID',
                            'as': 'department'
                        }
                    }, {
                        '$unwind': {
                            'path': '$department'
                        }
                    }
                ]).toArray().then(response => {
                    resolve(response[0])
                }).catch(err => {
                    reject(err)
                })
        })
    },
    getGenderNameByGenderId: (genderId) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.GENDER_COLLECTION)
                .findOne({ ID: parseInt(genderId) }).then(response => {
                    resolve(response.genderName)
                }).catch(err => {
                    reject(err)
                })
        })
    },
    filterScholarship: (user) => {
        let eligibleList = []
        return new Promise((resolve, reject) => {
            db.get().collection(collection.SCHOLARSHIP_COLLECTION).find()
                .toArray().then(async response => {
                    for (x in response) {
                        let isEligible = await Helper.checkEligibility(response[x], user)
                        if (isEligible.status)
                            eligibleList.push(response[x])
                    }
                    resolve(eligibleList)
                }).catch(err => {
                    reject(err)
                })
        })
    },
    scholarshipStatus: (scholarshipListId) => {
        return new Promise((resolve, reject) => {
            Helper.getScholarshipStatus(scholarshipListId)
                .then((scholarshipStatus) => {
                    resolve(scholarshipStatus)
                }).catch((scholarshipStatus) => {
                    reject(scholarshipStatus)
                })
        })

    },
    applicationStatus: (scholarshipId, scholarshipListId, userId) => {
        return new Promise(async (resolve, reject) => {
            const criteria = await Helper.getScholarshipCriteria(scholarshipId)
            const user = await Helper.getUserForEligibilityCheck(userId)
            Helper.checkEligibility(criteria, user).then(isEligible => {
                if (isEligible.status) {
                    Helper.getApplicationStatus(scholarshipListId, userId)
                        .then(applicationStatus => {
                            resolve(
                                {
                                    scholarshipListId: scholarshipListId,
                                    statusId: applicationStatus.statusId,
                                })
                        })
                } else {
                    resolve({ statusId: -4 })
                }
            })
        })
    },
    getScholarshipListByScholarshipListId: (scholarshipListId) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.SCHOLARSHIP_LIST_COLLECTION)
                .findOne({ ID: parseInt(scholarshipListId) }).then(response => {
                    if (response == null) {
                        reject("Unauthorized Operaton")
                    } else {
                        resolve(response)
                    }
                }).catch(err => {
                    reject(err)
                })
        })
    },
    getFamilyMembers: (userId) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.FAMILY_MEMBERS_COLLECTION)
                .find({ userId: ObjectId(userId) }).toArray().then(response => {
                    resolve(response)
                }).catch(err => {
                    reject(err)
                })
        })
    },
    addFamilyMembers: (data, userId) => {
        return new Promise((resolve, reject) => {
            data.userId = ObjectId(userId)
            data.name = data.name.toUpperCase()
            db.get().collection(collection.FAMILY_MEMBERS_COLLECTION)
                .insertOne(data).then(() => {
                    resolve()
                }).catch(err => {
                    reject(err)
                })
        })
    },
    deleteFamilyMember: (id) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.FAMILY_MEMBERS_COLLECTION)
                .deleteOne({ _id: ObjectId(id) }).then(() => {
                    resolve()
                }).catch(err => {
                    reject(err)
                })
        })
    },
    storeScholarshipFrom: (data, scholarship, user) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.APPLICATION_COLLECTION).findOneAndUpdate(
                {
                    userId: ObjectId(user._id),
                    scholarshipListId: parseInt(data.scholarshipListId)
                },
                {
                    "$set": {
                        applicationNo: scholarship.scholarshipCode + user.mobile,
                        userId: ObjectId(user._id),
                        applicationStatus: parseInt(data.applicationStatus),
                        scholarshipListId: parseInt(data.scholarshipListId),
                        applicationDate: new Date()
                    }
                },
                {
                    upsert: true
                }).then(response => {
                    let _id = ObjectId((response.value === null) ? response.lastErrorObject.upserted : response.value._id)
                    let storePersonalDetails = new Promise((resolve, reject) => {
                        db.get().collection(collection.APPLICATION_PERSONAL_DETAILS_COLLECTION)
                            .updateOne(
                                {
                                    applicationId: _id
                                },
                                {
                                    "$set": {
                                        _id,
                                        applicationId: _id,
                                        annualIncome: parseInt(data.annualIncome),
                                        partTimeJob: (data.partTimeJob == 1),
                                        partTimeJobName: data.partTimeJobName,
                                        pAddress: data.pAddress.toUpperCase(),
                                        cAddress: data.cAddress.toUpperCase(),
                                    }
                                },
                                {
                                    upsert: true
                                }).then(
                                    resolve()
                                ).catch(err => {
                                    reject(err)
                                })
                    })
                    let storeContactDetails = new Promise(async (resolve, reject) => {
                        db.get().collection(collection.APPLICATION_CONTACT_DETAILS_COLLECTION)
                            .updateOne(
                                {
                                    applicationId: _id
                                },
                                {
                                    "$set": {
                                        _id,
                                        applicationId: _id,
                                        state: data.state,
                                        district: await Helper.getDistrictById(data.district),
                                        districtId: parseInt(data.district),
                                        panchayath: data.panchayath,
                                        taluk: data.taluk,
                                        wardNo: parseInt(data.wardNo),
                                        wardMemberName: data.wardMemberName.toUpperCase(),
                                        wardMemberMobile: parseInt(data.wardMemberMobile),
                                    }
                                },
                                {
                                    upsert: true
                                }).then(
                                    resolve()
                                ).catch(err => {
                                    reject(err)
                                })
                    })
                    let storeAcademicDetails = new Promise((resolve, reject) => {
                        db.get().collection(collection.APPLICATION_ACADEMIC_DETAILS_COLLECTION)
                            .updateOne(
                                {
                                    applicationId: _id
                                },
                                {
                                    "$set": {
                                        _id,
                                        applicationId: _id,
                                        plusTwo: data.plusTwo,
                                        previousSem: data.previousSem,
                                        isHosteler: (data.isHosteler == 1),
                                        competitiveExam: (data.competitiveExam == 1),
                                        competitiveExamName: data.competitiveExamName,
                                        otherScholarship: (data.otherScholarship == 1),
                                        scholarshipName: data.scholarshipName
                                    }
                                },
                                {
                                    upsert: true
                                }).then(
                                    resolve()
                                ).catch(err => {
                                    reject(err)
                                })
                    })
                    Promise.all([storePersonalDetails, storeContactDetails, storeAcademicDetails])
                        .then((response) => {
                            resolve()
                        }).catch(err => {
                            reject(err)
                        })
                }).catch(err => {
                    reject(err)
                })
        })
    },
    getApplicationDetails: (scholarshipListId, userId) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.APPLICATION_COLLECTION).findOne({
                userId: ObjectId(userId),
                scholarshipListId: parseInt(scholarshipListId)
            }).then(application_details => {
                if (application_details) {
                    let personal_details = new Promise((resolve, reject) => {
                        db.get().collection(collection.APPLICATION_PERSONAL_DETAILS_COLLECTION)
                            .findOne({ applicationId: ObjectId(application_details._id) }).then(response => {
                                resolve(response)
                            }).catch(err => {
                                reject(err)
                            })
                    });
                    let academic_details = new Promise((resolve, reject) => {
                        db.get().collection(collection.APPLICATION_ACADEMIC_DETAILS_COLLECTION)
                            .findOne({ applicationId: ObjectId(application_details._id) }).then(response => {
                                resolve(response)
                            }).catch(err => {
                                reject(err)
                            })
                    });
                    let contact_details = new Promise((resolve, reject) => {
                        db.get().collection(collection.APPLICATION_CONTACT_DETAILS_COLLECTION)
                            .findOne({ applicationId: ObjectId(application_details._id) }).then(response => {
                                resolve(response)
                            }).catch(err => {
                                reject(err)
                            })
                    });
                    Promise.all([personal_details, academic_details, contact_details])
                        .then(allDetails => {
                            allDetails.push(application_details)
                            resolve(allDetails)
                        }).catch(err => {
                            reject(err)
                        })
                } else {
                    resolve()
                }
            }).catch(err => {
                reject(err)
            })
        })
    },
    getBankDetails: (userId) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.BANK_DETAILS_COLLECTION)
                .findOne({ userId: ObjectId(userId) }).then(response => {
                    resolve(response)
                }).catch(err => {
                    reject(err)
                })
        })
    },
    saveBankDetails: (data, userId) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.BANK_DETAILS_COLLECTION)
                .insertOne({
                    _id: ObjectId(userId),
                    userId: ObjectId(userId),
                    accountHolderName: data.accountHolderName.toUpperCase(),
                    accountNo: data.accountNo1.toUpperCase(),
                    bankName: data.bankName.toUpperCase(),
                    ifsc: data.ifsc.toUpperCase(),
                    branch: data.branch.toUpperCase()
                }).then(response => {
                    resolve()
                }).catch(err => {
                    reject(err)
                })
        })
    },
    checkBankAndFamily: (userId) => {
        return new Promise((resolve, reject) => {
            let bank = new Promise((resolve, reject) => {
                db.get().collection(collection.BANK_DETAILS_COLLECTION)
                    .findOne({ userId: ObjectId(userId) }).then((response) => {
                        resolve(response)
                    })
            })
            let family = new Promise((resolve, reject) => {
                db.get().collection(collection.FAMILY_MEMBERS_COLLECTION)
                    .find({ userId: ObjectId(userId) }).toArray().then((response) => {
                        resolve(response)
                    })
            })
            Promise.all([bank, family]).then(([bank, family]) => {
                if (bank === null && family.length === 0) {
                    resolve({ status: false, message: "please add bank and family details" })
                }
                else if (bank === null) {
                    resolve({ status: false, message: "please add bank details" })
                } else if (family.length === 0) {
                    resolve({ status: false, message: "please add family details" })
                } else {
                    resolve({ status: true })
                }
            }).catch(err => {
                reject(err)
            })
        })
    },
    //need
    updatePassword: (user, passData) => {
        return new Promise(async (resolve, reject) => {
            if (bcrypt.compare(passData.currentPassword, user.password)) {
                if (passData.newPassword === passData.confirmNewPassword) {
                    passData.currentPassword = await bcrypt.hash(passData.newPassword, 10)
                    db.get().collection(collection.USER_COLLECTION).updateOne({ username: user.username }, { "$set": { password: passData.currentPassword } }).then(() => {
                        resolve(passData.currentPassword)
                    }).catch(err => {
                        reject(err)
                    })
                }
            }
        })
    },
    forgotPassword: (email, url) => {
        return new Promise(async (resolve, reject) => {
            db.get().collection(collection.USER_COLLECTION).findOne({ email: email }).then(user => {
                if (user) {
                    let token = crypto.randomBytes(20)
                    token = token.toString('hex')
                    db.get().collection(collection.PASSWORD_FORGOT_COLLECTION)
                        .insertOne({
                            userId: ObjectId(user._id),
                            resetPasswordToken: token,
                            resetPasswordExpires: Date.now() + 900000,
                        })
                        .then(() => {
                            nodeMailer({
                                recipient: user.email,
                                subject: 'Link for Password Reset',
                                message: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
                                    'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
                                    'https://' + process.env.domaine + '/reset-password/' + token + '\n\n' +
                                    'If you did not request this, please ignore this email and your password will remain unchanged.\n'
                            })
                            resolve()
                        }).catch(() => {
                            reject("Error Occurred Try Again")
                        })
                    resolve()
                } else {
                    reject('User not Found')
                }
            }).catch(err => {
                reject(err)
            })
        })
    },
    resetPasswordTokenValidate: (token) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.PASSWORD_FORGOT_COLLECTION)
                .findOne({ resetPasswordToken: token, resetPasswordExpires: { "$gt": Date.now() } })
                .then(response => {
                    if (response) {
                        resolve()
                    } else {
                        reject()
                    }
                }).catch(err => {
                    reject(err)
                })
        })
    },
    resetPassword: (token, password) => {
        return new Promise(async (resolve, reject) => {
            password = await bcrypt.hash(password, 10)
            db.get().collection(collection.PASSWORD_FORGOT_COLLECTION)
                .findOne({ resetPasswordToken: token, resetPasswordExpires: { "$gt": Date.now() } })
                .then(response => {
                    if (response) {
                        db.get().collection(collection.USER_COLLECTION).updateOne({ _id: ObjectId(response.userId) }, { "$set": { password: password } })
                            .then(() => {
                                db.get().collection(collection.PASSWORD_FORGOT_COLLECTION).updateOne(
                                    {
                                        _id: ObjectId(response._id)
                                    },
                                    {
                                        "$set": {
                                            resetPasswordExpires: Date.now()
                                        }
                                    }).then(() => {
                                        resolve()
                                    }).catch(err => {
                                        reject(err)
                                    })
                            }).catch(err => {
                                reject(err)
                            })
                    } else {
                        reject()
                    }
                }).catch(err => {
                    reject(err)
                })
        })
    },
    updateProfile: (userId, data) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.USER_COLLECTION)
                .updateOne({ _id: ObjectId(userId) },
                    {
                        "$set": {
                            name: data.name.toUpperCase(),
                            //genderId: parseInt(data.gender),
                            dob: new Date(data.dob),
                            //email: data.email,
                            mobile: parseInt(data.mobile),
                            batchId: parseInt(data.batch)
                        }
                    }).then(() => {
                        resolve()
                    }).catch(err => {
                        reject(err)
                    })
        })
    },
    getApplicationList: (userId) => {
        return new Promise((resolve, reject) => {
            db.get().collection(collection.APPLICATION_COLLECTION)
                .aggregate([
                    {
                        '$match': {
                            'userId': ObjectId(userId)
                        }
                    }, {
                        '$lookup': {
                            'from': 'application_status',
                            'localField': 'applicationStatus',
                            'foreignField': 'id',
                            'as': 'applicationStatus'
                        }
                    }, {
                        '$lookup': {
                            'from': 'scholarship_list',
                            'localField': 'scholarshipListId',
                            'foreignField': 'ID',
                            'as': 'scholarship'
                        }
                    }, {
                        '$unwind': {
                            'path': '$scholarship'
                        }
                    }, {
                        '$lookup': {
                            'from': 'academic_year',
                            'localField': 'scholarship.academicId',
                            'foreignField': 'ID',
                            'as': 'academic_year'
                        }
                    }, {
                        '$unwind': {
                            'path': '$applicationStatus'
                        }
                    }, {
                        '$unwind': {
                            'path': '$academic_year'
                        }
                    }, {
                        '$project': {
                            'scheme': '$scholarship.scholarshipName',
                            'applicationNo': 1,
                            'applicationStatus': '$applicationStatus.message',
                            'academic_year': '$academic_year.academicName',
                            'applicationDate': {
                                '$dateToString': {
                                    'format': '%d-%m-%Y',
                                    'date': '$applicationDate'
                                }
                            }
                        }
                    }
                ]).toArray().then(applications => {
                    resolve(applications)
                }).catch(err => {
                    reject(err)
                })
        })
    }
}

module.exports.getNewId = () => {
    return new Promise(async (resolve, reject) => {
        let doc = await db.get().collection(collection.ID_GENERATOR).findOneAndUpdate({ _id: "id" }, { "$inc": { seq: 1 } })
        resolve(doc.value.seq)
    })
}
