const express = require('express');
const router = express.Router();
const userHelper = require('../helpers/user_helper')
const passport = require('passport')
const auth = require('../configs/auth');
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const Helper = require('../helpers/Helper');
const pdfHelper = require('../helpers/pdfHelper');
const fs = require('fs');
const { response, application } = require('express');

/* GET home page. */

router.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.type === 'user')
            res.redirect('/home')
        else if (req.user.type === 'admin')
            res.redirect('/admin')
        else
            res.render('user/login')
    } else {
        res.render('index')
    }
})

router.get('/home', auth.ensureUserAuthenticated, function (req, res, next) {
    userHelper.getDeptAndCourseAndBatchByBatchId(req.user.batchId)
        .then(async response => {
            req.user.department = response.department.DEPARTMENTNAME;
            req.user.batch = response.BATCHNAME;
            req.user.course = response.course.COURSENAME;
            req.user.gender = await userHelper.getGenderNameByGenderId(req.user.genderId)
            req.user.dob = new Date(req.user.dob).toLocaleDateString('en-GB')
            res.render('user/home');
        }).catch(err => {
            console.log(err);
            res.redirect('/home')
        })
});

router.get("/registration", (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.type === 'user')
            res.redirect('/home')
        else if (req.user.type === 'admin')
            res.redirect('/admin')
        else
            res.render('user/login')
    } else {
        userHelper.getDepartments().then(departments => {
            userHelper.getGenders().then(gender => {
                res.render('user/registration', { departments, gender, captchaSitekey: process.env.captchaSitekey })
            })
        })
    }
})

router.get('/get-course-by-dept-id/:id', (req, res) => {
    department_id = parseInt(req.params.id);
    userHelper.getCoursesByDeptId(department_id).then(courses => {
        res.json({ courses })
    })
})

router.get('/get-batch-by-course-id/:id', (req, res) => {
    course_id = parseInt(req.params.id);
    userHelper.getBatchByCoursesId(course_id).then(batches => {
        res.json({ batches })
    })
})

router.post("/registration",
    body('mobile', 'mobile number must be 10 digits').isLength({ max: 10, min: 10 }),
    body('password', 'password require minimum 8 characters').isLength({ min: 8 }),
    async (req, res) => {
        const captcha_response_key = req.body["g-recaptcha-response"];
        const url = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.captchaSecretKey}&response=${captcha_response_key}`;
        let captcha_response = await axios.post(url, {
            secret: process.env.captchaSecretKey,
            response: captcha_response_key
        })
        let error = []
        const errors = validationResult(req);
        isErrors = (Array.isArray(errors.errors) && errors.errors.length)
        if (captcha_response.data.success == false) {
            error.push('Captcha not Verified properly')
            res.json({ status: false, errors: error })
        } else if (isErrors) {
            for (x in errors.errors) {
                error.push(errors.errors[x].msg)
            }
            res.json({ status: false, errors: error })
        } else if (req.body.password != req.body.c_password) {
            error.push('password do not match')
            res.json({ status: false, errors: error })
        } else {
            userHelper.useRegistration(req.body, req.headers.host).then(response => {
                res.json({ status: true, message: response })
            }).catch(response => {
                error.push(response)
                res.json({ status: false, errors: error })
            })
        }
    })

router.get('/verify-email/:token', (req, res) => {
    userHelper.verifyEmail(req.params.token).then(response => {
        req.flash('success_msg', response)
        res.redirect('/login')
    }).catch(response => {
        req.flash('error_msg', response)
        res.redirect('/login')
    })
})

router.get('/scholarships', auth.ensureUserAuthenticated, (req, res) => {
    userHelper.filterScholarship(req.user).then(scholarship => {
        userHelper.checkBankAndFamily(req.user._id).then(response => {
            if (response.status) {
                res.render('user/scholarships', { scholarships: scholarship })
            } else {
                req.flash('error_msg', response.message)
                res.redirect('/home')
            }
        }).catch(err => {
            req.flash('error_msg', "Error Occured")
            res.redirect('/home')
        })
    }).catch(err => {
        req.flash('error_msg', "Error Occured")
        res.redirect('/home')
    })
})

router.get('/scholarship-status/:id', auth.ensureUserAuthenticated, (req, res) => {
    let scholarshipListId = req.params.id;
    userHelper.scholarshipStatus(scholarshipListId).then((scholarshipStatus) => {
        res.json(scholarshipStatus)
    }).catch(scholarshipStatus => {
        Helper.getApplicationStatusMessage(scholarshipStatus.statusId).then(message => {
            scholarshipStatus.message = message
            res.json(scholarshipStatus)
        }).catch(err => {
            res.json(err)
        })
    })
})
router.get('/application-status/:id', auth.ensureUserAuthenticated,
    (req, res) => {
        const scholarshipId = req.params.id;
        Helper.findCurrentAcademicYear().then(academicYear => {
            Helper.getScholarshipListId(scholarshipId, academicYear.ID)
                .then(scholarshipListId => {
                    userHelper.applicationStatus(scholarshipId, scholarshipListId, req.user._id)
                        .then(applicationStatus => {
                            Helper.getApplicationStatusMessage(applicationStatus.statusId).then(message => {
                                applicationStatus.message = message
                                res.json(applicationStatus)
                            }).catch(err => {
                                res.json(err)
                            })
                        })
                }).catch(() => {
                    let scholarshipStatus = { statusId: -2 }
                    Helper.getApplicationStatusMessage(scholarshipStatus.statusId).then(message => {
                        scholarshipStatus.message = message
                        res.json(scholarshipStatus)
                    }).catch(err => {
                        res.json(err)
                    })
                })
        }).catch(academicStatus => {
            Helper.getApplicationStatusMessage(academicStatus.statusId).then(message => {
                academicStatus.message = message
                res.json(academicStatus)
            }).catch(err => {
                res.json(err)
            })
        })
    })

router.get('/scholarship-form/:id', auth.ensureUserAuthenticated,
    (req, res) => {
        let scholarshipListId = req.params.id
        userHelper.getScholarshipListByScholarshipListId(scholarshipListId)
            .then((scholarship) => {
                userHelper.applicationStatus(scholarship.scholarshipId, scholarshipListId, req.user._id)
                    .then(applicationStatus => {
                        isTrue = applicationStatus.statusId == 0 || applicationStatus.statusId == -1 || applicationStatus.statusId == 1
                        let next = async () => {
                            districts = await Helper.getDistrictList()
                            states = await Helper.getStateList()
                            userHelper.getApplicationDetails(scholarshipListId, req.user._id)
                                .then(async applicationDetails => {
                                    let taluks, panchayaths;
                                    let [personal_details, academic_details, contact_details, application_details] = [null, null, null, null];
                                    if (applicationDetails) {
                                        [personal_details, academic_details, contact_details, application_details] = applicationDetails
                                        taluks = await Helper.getTaluks(contact_details.districtId)
                                        panchayaths = await Helper.getPanchayaths(contact_details.districtId)
                                        if (application_details.applicationStatus != -1) application_details.saveStatus = true
                                    }
                                    res.render('user/scholarship-form',
                                        {
                                            personal_details,
                                            academic_details,
                                            contact_details,
                                            application_details,
                                            states,
                                            districts,
                                            scholarship,
                                            panchayaths,
                                            taluks,
                                            user: req.user
                                        })
                                }).catch((err) => {
                                    req.flash('error_msg', err)
                                    res.redirect('/scholarships')
                                })

                        }
                        if (isTrue) {
                            userHelper.scholarshipStatus(scholarshipListId)
                                .then(async scholarshipStatus => {
                                    next()
                                }).catch((err) => {
                                    if (applicationStatus.statusId == -1) next()
                                    else {
                                        req.flash('error_msg', err)
                                        res.redirect('/scholarships')
                                    }
                                })
                        }
                        else {
                            req.flash('error_msg', response.message)
                            res.redirect('/scholarships')
                        }
                    }).catch((err) => {
                        req.flash('error_msg', err)
                        res.redirect('/scholarships')
                    })
            }).catch((err) => {
                req.flash('error_msg', err)
                res.redirect('/scholarships')
            })
    })

router.post('/scholarship-form', auth.ensureUserAuthenticated,
    body('plusTwo', '+2 Mark Percentage must be Numeric').isDecimal(),
    body('wardMemberMobile', 'Mobile number must be 10 digits').isLength({ min: 10, max: 10 }),
    (req, res) => {
        const errors = validationResult(req);
        let error = []
        if (req.body.previousSem != '') {
            req.body.previousSem = parseFloat(req.body.previousSem)
            if (isNaN(req.body.previousSem)) {
                error.push("Previous Sem Mark Percentage must be Numeric")
            }
        }
        isErrors = (Array.isArray(errors.errors) && errors.errors.length)
        if (isErrors || error.length > 0) {
            for (x in errors.errors) {
                error.push(errors.errors[x].msg)
            }
            res.json({ status: false, errors: error })
        }
        else if (req.body.plusTwo > 100 || req.body.previousSem > 100) {
            error.push("Mark Percentage is greater than 100")
            res.json({ status: false, errors: error })
        }
        else {
            let scholarshipListId = req.body.scholarshipListId;
            userHelper.getScholarshipListByScholarshipListId(scholarshipListId)
                .then((scholarship) => {
                    userHelper.applicationStatus(scholarship.scholarshipId, scholarshipListId, req.user._id)
                        .then((applicationStatus) => {
                            isTrue = applicationStatus.statusId == 0 || applicationStatus.statusId == -1 || applicationStatus.statusId == 1
                            if (isTrue) {
                                userHelper.scholarshipStatus(scholarshipListId)
                                    .then(async scholarshipStatus => {
                                        userHelper.storeScholarshipFrom(req.body, scholarship, req.user).then(() => {
                                            res.json({ status: true, message: "Application Submitted Successfully" })
                                        })
                                    }).catch(scholarshipStatus => {
                                        if (applicationStatus.statusId == -1) {
                                            userHelper.storeScholarshipFrom(req.body, scholarship, req.user).then(() => {
                                                res.json({ status: true, message: "Application Submitted Successfully" })
                                            })
                                        } else {
                                            res.json({ status: false })
                                        }
                                    })
                            }
                            else {
                                res.json({ status: false })
                            }
                        }).catch(err => {
                            res.json({ status: false })
                        })
                }).catch((err) => {
                    res.json({ status: false })
                })
        }
    })

router.get('/getVillageMunicipality/:districtId', async (req, res) => {
    let districtId = req.params.districtId
    let panchayaths = await Helper.getPanchayaths(districtId)
    res.json(panchayaths)
})

router.get('/getTaluk/:districtId', async (req, res) => {
    let districtId = req.params.districtId
    let taluks = await Helper.getTaluks(districtId)
    res.json(taluks)
})

router.get('/family-members', auth.ensureUserAuthenticated, (req, res) => {
    userHelper.getFamilyMembers(req.user._id).then(response => {
        res.render('user/family-members', { familyMembers: response })
    })
})

router.post('/add-family-member', auth.ensureUserAuthenticated, (req, res) => {
    req.body.age = parseInt(req.body.age)
    userHelper.addFamilyMembers(req.body, req.user._id).then(response => {
        res.json({ status: true })
    })
})

router.post('/delete-member', auth.ensureUserAuthenticated, (req, res) => {
    userHelper.deleteFamilyMember(req.body.id).then(response => {
        res.json({ status: true })
    })
})

router.get('/bank-details', auth.ensureUserAuthenticated, (req, res) => {
    userHelper.getBankDetails(req.user._id).then(response => {
        if (response) {
            res.render('user/bank-details', { data: response })
        } else {
            res.render('user/bank-form')
        }
    })
})

router.post("/bank-details", auth.ensureUserAuthenticated, async (req, res) => {
    if (req.body.accountNo1 != req.body.accountNo2) {
        res.json({ status: false, message: "Account No Mismatch" })
    } else if (await userHelper.getBankDetails(req.user._id)) {
        res.json({ status: false, message: "Form Already Submitted" })
    }
    else {
        userHelper.saveBankDetails(req.body, req.user._id).then(response => {
            res.json({ status: true, message: "Account Details Saved" })
        }).catch(err => {
            res.json({ status: false, message: "Error Occured Try Again" })
        })
    }
})

router.get('/forgot-password', (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.type === 'user')
            res.redirect('/home')
        else if (req.user.type === 'admin')
            res.redirect('/admin')
        else
            res.render('user/login')
    } else {
        res.render('user/forgot-password')
    }
})

router.post('/forgot-password', (req, res) => {
    userHelper.forgotPassword(req.body.email, req.headers.host).then(response => {
        res.json({ status: true, message: 'An e-mail has been sent to ' + req.body.email + ' with further instructions.' })
    }).catch(response => {
        res.json({ status: false, message: response })
    })
})
router.get('/reset-password/:token', (req, res) => {
    userHelper.resetPasswordTokenValidate(req.params.token).then(() => {
        res.render('user/reset-password')
    }).catch(() => {
        req.flash('error_msg', 'Password reset token is invalid or has expired.')
        res.redirect('/forgot-password')
    })
})

router.post('/reset-password/:token',
    body('password', 'Password require minimum 8 characters').isLength({ min: 8 }),
    (req, res) => {
        const errors = validationResult(req);
        let isErrors = (Array.isArray(errors.errors) && errors.errors.length)
        if (isErrors) {
            req.flash('error_msg', errors.errors[0].msg)
            res.redirect(req.url)
        } else if (req.body.password != req.body.cPassword) {
            req.flash('error_msg', "Password do not match")
            res.redirect(req.url)
        } else {
            userHelper.resetPassword(req.params.token, req.body.password).then(() => {
                req.flash('success_msg', 'Password Reset Successful')
                res.redirect('/login')
            }).catch(() => {
                req.flash('error_msg', 'Password reset token is invalid or has expired.')
                res.redirect('/forgot-password')
            })
        }
    })

router.get('/print-application', auth.ensureUserAuthenticated, (req, res) => {
    let scholarshipListId = parseInt(req.query.id)
    userHelper.getScholarshipListByScholarshipListId(scholarshipListId)
        .then((scholarship) => {
            userHelper.applicationStatus(scholarship.scholarshipId, scholarshipListId, req.user._id)
                .then(async (applicationStatus) => {
                    isTrue = applicationStatus.statusId == 2 || applicationStatus.statusId == 3 || applicationStatus.statusId == 4
                    if (isTrue) {
                        Helper.getApplicationDetails(req.user._id, scholarshipListId).then(async data => {
                            const stream = res.writeHead(200, {
                                'Content-Type': 'application/pdf',
                                'Content-Disposition': `inline;filename=` + data.applicationNo + `.pdf`,
                                // 'Content-Disposition': `attachment;filename=scholarship.pdf`,
                            });

                            let batchDetails = await userHelper.getDeptAndCourseAndBatchByBatchId(data.user.batchId)
                            data.user.department = batchDetails.department.DEPARTMENTNAME;
                            data.user.batch = batchDetails.BATCHNAME;
                            data.user.course = batchDetails.course.COURSENAME;
                            data.user.gender = await userHelper.getGenderNameByGenderId(data.user.genderId)
                            pdfHelper.buildPDF(data,
                                (chunk) => stream.write(chunk),
                                () => stream.end()
                            );
                        }).catch((err) => {
                            req.flash('error_msg', err)
                            res.redirect('/home')
                        })
                    }
                    else {
                        req.flash('error_msg', response.message)
                        res.redirect('/home')
                    }
                })
        }).catch((err) => {
            req.flash('error_msg', err)
            res.redirect('/home')
        })
})

router.get('/prospectus', (req, res) => {
    let scholarshipId = req.query.id;
    var file = fs.createReadStream('./public/pdf/scholarship/' + scholarshipId + '.pdf');
    var stat = fs.statSync('./public/pdf/scholarship/' + scholarshipId + '.pdf');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=prospectus.pdf');
    file.pipe(res);
})

router.get('/settings', auth.ensureUserAuthenticated, (req, res) => {
    res.render('user/settings')
})

router.get('/edit-profile', auth.ensureUserAuthenticated,
    (req, res) => {
        userHelper.getDeptAndCourseAndBatchByBatchId(req.user.batchId)
            .then(async response => {
                const departments = await userHelper.getDepartments()
                const genders = await userHelper.getGenders()
                req.user.department = response.department.DEPARTMENTNAME;
                // departments.pop(departments.DEPARTMENTNAME)
                req.user.batch = response.BATCHNAME;
                req.user.course = response.course.COURSENAME;
                req.user.gender = await userHelper.getGenderNameByGenderId(req.user.genderId)
                req.user.dob = req.user.dob.toLocaleString('en-CA').slice(0, 10)
                res.render('user/edit-profile', { departments, genders })
            }).catch(err => {
                console.log(err);
                res.redirect('/edit-profile')
            })
    })

router.post('/edit-profile', auth.ensureUserAuthenticated,
    (req, res) => {
        userHelper.updateProfile(req.user._id, req.body).then(() => {
            req.flash('success_msg', "Profile Updated")
            res.redirect('/edit-profile')
        }).catch(err => {
            console.log(err);
            req.flash('error_msg', "Error occured")
            res.redirect('/edit-profile')
        })
    })

router.get('/applications', auth.ensureUserAuthenticated,
    (req, res) => {
        userHelper.getApplicationList(req.user._id)
            .then(applications => {
                res.render('user/applications', { applications })
            }).catch(err => {
                console.log(err);
                req.flash('error_msg', "Error occured")
                res.render('user/applications')
            })
    })

router.get("/login", (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.type === 'user')
            res.redirect('/home')
        else if (req.user.type === 'admin')
            res.redirect('/admin')
        else
            res.render('user/login')
    } else
        res.render('user/login')
})

router.post('/login',
    passport.authenticate('user', { successRedirect: '/home', failureRedirect: '/login', failureFlash: true }), (req, res) => {
        res.redirect('/home')
    });

router.get('/logout', auth.ensureUserAuthenticated,
    (req, res) => {
        req.logout();
        res.redirect('/login')
    })




module.exports = router;