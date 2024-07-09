import { randomUUID } from 'node:crypto'

const admZipStubs = {
    addFile: jest.fn(),
    toBuffer: jest.fn(),
    toString: jest.fn(),
}

const utilsStubs = {
    isAvailable: jest.fn(),
    getGreeting: jest.fn(),
    getAge: jest.fn(),
    getUserFullName: jest.fn(),
    extractContextMenu: jest.fn(),
    extractNavigationPanel: jest.fn(),
}

class AdmZipMock {
    addFile(...args: unknown[]): unknown {
        return admZipStubs.addFile(...args)
    }

    toBuffer(...args: unknown[]): unknown {
        return admZipStubs.toBuffer(...args)
    }
}

jest.mock('adm-zip', () => AdmZipMock)
const actualUtils = jest.requireActual('@diia-inhouse/utils')

jest.mock('@diia-inhouse/utils', () => ({
    ...actualUtils,
    PublicServiceUtils: {
        isAvailable: utilsStubs.isAvailable,
        extractContextMenu: utilsStubs.extractContextMenu,
        extractNavigationPanel: utilsStubs.extractNavigationPanel,
    },
    utils: {
        handleError: actualUtils.utils.handleError.bind(actualUtils.utils),
        getGreeting: utilsStubs.getGreeting,
        getAge: utilsStubs.getAge,
        getUserFullName: utilsStubs.getUserFullName,
    },
}))

import moment from 'moment'

import { RatingCategory } from '@diia-inhouse/analytics'
import { Query, UpdateWriteOpResult } from '@diia-inhouse/db'
import DiiaLogger from '@diia-inhouse/diia-logger'
import { EventBus, Task } from '@diia-inhouse/diia-queue'
import {
    GetInternalPassportWithRegistrationResponse,
    InternalPassport,
    PassportByInnDocumentType,
    ResidencePermit,
} from '@diia-inhouse/documents-service-client'
import { BadRequestError, ModelNotFoundError, NotFoundError, ServiceUnavailableError, ValidationError } from '@diia-inhouse/errors'
import TestKit, { mockInstance } from '@diia-inhouse/test'
import { DocStatus, DurationMs, PublicServiceStatus, SessionType } from '@diia-inhouse/types'
import { UserDocument } from '@diia-inhouse/user-service-client'

import {
    CriminalRecordCertificate,
    CriminalRecordCertificateApplicationScreen,
    CriminalRecordCertificateStatus,
    CriminalRecordCertificateType,
    PublicServiceCode,
} from '@src/generated'
import CriminalRecordCertificateProvider from '@src/providers/criminalRecordCertificate/sevdeir'

import AddressService from '@services/address'
import AnalyticsService from '@services/analytics'
import CriminalRecordCertificateService from '@services/criminalRecordCertificate'
import DocumentsService from '@services/documents'
import NotificationService from '@services/notification'
import UserService from '@services/user'

import criminalRecordCertificateModel from '@models/criminalRecordCertificate'

import CriminalRecordCertificateMapper from '@dataMappers/criminalRecordCertificateDataMapper'

import { cryptoDocServiceClient, publicServiceCatalogClient } from '@tests/mocks/grpc/clients'

import { AppConfig } from '@interfaces/config'
import {
    CriminalCertificateUpdateEventStatus,
    CriminalRecordCertOrderGender,
    CriminalRecordCertOrderStatus,
    CriminalRecordCertOrderType,
} from '@interfaces/providers/criminalRecordCertificate'
import { InternalEvent } from '@interfaces/queue'
import { IdentityDocumentType, ProcessCode } from '@interfaces/services'
import { MessageTemplateCode } from '@interfaces/services/notification'
import { ServiceTask } from '@interfaces/tasks'

describe('CriminalRecordCertificateService', () => {
    const testKit = new TestKit()
    const config = <AppConfig>{
        app: { dateFormat: 'DD.MM.YYYY' },
        sevdeir: {
            isEnabled: true,
            criminalRecordCertificate: {
                applicationExpirationDays: 90,
                checkBatchSize: 3,
                checkIntervalMs: 30000,
            },
        },
    }
    const loggerMock = mockInstance(DiiaLogger)
    const taskMock = mockInstance(Task)
    const eventBusMock = mockInstance(EventBus)
    const addressServiceMock = mockInstance(AddressService)
    const notificationServiceMock = mockInstance(NotificationService)
    const documentsServiceMock = mockInstance(DocumentsService)
    const userServiceMock = mockInstance(UserService)
    const criminalRecordCertificateMapperMock = mockInstance(CriminalRecordCertificateMapper, {
        applicationStartMessage:
            'Щоб отримати витяг про несудимість, потрібно вказати: \n\n• тип та мету запиту; \n• місце народження; \n• контактні дані. \n\nЯкщо з даними все гаразд, ви отримаєте витяг протягом 10 робочих днів. Якщо вони потребують додаткової перевірки — протягом 30 календарних днів.',
        missingTaxpayerCardAttentionMessage: 'Неможливо отримати витяг про несудимість. Ваш РНОКПП не пройшов перевірку податковою.',
        confirmingTaxpayerCardAttentionMessage: 'Ваш РНОКПП ще перевіряється податковою. Спробуйте, будь ласка, пізніше.',
        unsuitableAgeAttentionMessage: 'Неможливо отримати витяг про несудимість. Вам ще не виповнилося 14 років.',
        serviceIsNotActiveAttentionMessage: 'На жаль, послуга тимчасово недоступна',
        processingApplicationExistsMessage:
            'Наразі послуга недоступна.\nБудь ласка, дочекайтесь завершення обробки попереднього запиту та замовте новий витяг.',
        noCertificatesByStatusMessage: {
            [CriminalRecordCertificateStatus.done]: {
                icon: '🤷‍♂️',
                text: 'Наразі немає готових витягів. \nМи повідомимо, коли замовлені витяги будуть готові.',
                parameters: [],
            },
        },
    })
    const criminalRecordCertificateProviderMock = mockInstance(CriminalRecordCertificateProvider, {
        reasons: new Map([
            ['1', "Усиновлення, установлення опіки (піклування), створення прийомної сім'ї або дитячого будинку сімейного типу"],
            ['2', 'Оформлення візи для виїзду за кордон'],
            ['56', 'Надання до установ іноземних держав'],
            ['5', 'Оформлення на роботу'],
            ['55', 'Оформлення дозволу на зброю, оформлення ліцензії на роботу з вибуховими речовинами'],
            ['7', 'Оформлення ліцензії на роботу з наркотичними засобами, психотропними речовинами та прекурсорами'],
            ['37', 'Оформлення участі в процедурі закупівель'],
            ['9', 'Оформлення громадянства'],
            ['63', 'Подання до територіального центру комплектування та соціальної підтримки'],
            ['44', "Пред'явлення за місцем вимоги"],
        ]),
        types: [
            {
                code: CriminalRecordCertificateType.short,
                name: 'Короткий',
                description: 'Відсутність чи наявність судимості',
            },
            {
                code: CriminalRecordCertificateType.full,
                name: 'Повний',
                description:
                    'Притягнення до кримінальної відповідальності; наявність чи відсутність судимості; обмеження, передбачені кримінально-процесуальним законодавством',
            },
        ],
    })
    const analyticsServiceMock = mockInstance(AnalyticsService)
    const criminalRecordCertificateService = new CriminalRecordCertificateService(
        config,
        loggerMock,
        taskMock,
        eventBusMock,
        addressServiceMock,
        notificationServiceMock,
        documentsServiceMock,
        publicServiceCatalogClient,
        userServiceMock,
        criminalRecordCertificateMapperMock,
        criminalRecordCertificateProviderMock,
        analyticsServiceMock,
        cryptoDocServiceClient,
    )
    const { user } = testKit.session.getUserSession()
    const now = new Date()

    const {
        lastNameUA,
        firstNameUA,
        middleNameUA,
        recordNumber,
        genderEN,
        birthday,
        birthPlaceUA,
        series,
        docNumber,
        issueDate,
        expirationDate,
        department,
    } = <InternalPassport>testKit.docs.generateDocument(IdentityDocumentType.InternalPassport)
    const internalPassportWithRegistration = <GetInternalPassportWithRegistrationResponse>{
        registration: {
            address: {
                registrationDate: '20.07.1969',
                cancelregistrationDate: '',
                addressKoatuu: '8000000000',
                addressGromKatottg: 'UA80000000000000000',
            },
            fullName: 'УКРАЇНА М. КИЇВ ВУЛ. АРМСТРОНГА БУД. 11 КВ. 69',
            registrationDate: moment('20.07.1969', config.app.dateFormat).toDate(),
        },
        passport: {
            birthCountry: 'Україна',
            lastNameUA,
            firstNameUA,
            middleNameUA,
            recordNumber,
            genderEN,
            birthday,
            birthPlaceUA,
            type: PassportByInnDocumentType.pass,
            docSerial: series,
            docNumber,
            issueDate,
            expirationDate,
            department,
        },
    }

    const publicServiceSettings = {
        id: randomUUID(),
        categories: [],
        code: PublicServiceCode.criminalRecordCertificate,
        name: 'criminal-record-certificate-settings',
        status: PublicServiceStatus.active,
        segments: [],
        contextMenu: [],
        sessionTypes: [SessionType.User],
        sortOrder: 1,
        locales: {
            UA: 'ua',
        },
    }

    beforeAll(() => {
        jest.useFakeTimers({ now })
    })

    afterAll(() => {
        jest.useRealTimers()
    })

    describe('method `types`', () => {
        it('should fetch types from provider', () => {
            expect(criminalRecordCertificateService.types).toEqual(criminalRecordCertificateProviderMock.types)
        })
    })

    describe('method `reasons`', () => {
        it('should fetch reasons from provider', () => {
            expect(criminalRecordCertificateService.reasons).toEqual(criminalRecordCertificateProviderMock.reasons)
        })
    })

    describe('reasons', () => {})

    describe('method `checkSendApplicationDataParams`', () => {
        const { phoneNumber } = user
        const validParams = {
            nationalities: [],
            phoneNumber,
            publicService: {
                code: PublicServiceCode.criminalRecordCertificate,
                resourceId: randomUUID(),
            },
            reasonId: randomUUID(),
            certificateType: CriminalRecordCertificateType.full,
        }

        it('should successfully pass validation', () => {
            expect(() => {
                criminalRecordCertificateService.checkSendApplicationDataParams(validParams)
            }).not.toThrow()
        })

        it.each([
            [
                'publicService and reasonId is missing',
                { ...validParams, publicService: undefined, reasonId: undefined },
                new ValidationError([
                    {
                        type: 'Fields are required',
                        message: 'reasonId, certificateType, phoneNumber are required when publicService provided',
                        field: 'reasonId, certificateType, phoneNumber',
                    },
                ]),
            ],
            [
                'publicService and certificateType is missing',
                { ...validParams, publicService: undefined, certificateType: undefined },
                new ValidationError([
                    {
                        type: 'Fields are required',
                        message: 'reasonId, certificateType, phoneNumber are required when publicService provided',
                        field: 'reasonId, certificateType, phoneNumber',
                    },
                ]),
            ],
            [
                'publicService and phoneNumber is missing',
                { ...validParams, publicService: undefined, phoneNumber: '' },
                new ValidationError([
                    {
                        type: 'Fields are required',
                        message: 'reasonId, certificateType, phoneNumber are required when publicService provided',
                        field: 'reasonId, certificateType, phoneNumber',
                    },
                ]),
            ],
            [
                'publicService code is not expected and resourceId is not included',
                { ...validParams, publicService: { code: PublicServiceCode.damagedPropertyRecovery } },
                new ValidationError([
                    {
                        type: 'Field is required',
                        message: `publicService.resourceId is required when publicService.code in ${[
                            PublicServiceCode.damagedPropertyRecovery,
                        ].join('|')} values`,
                        field: 'publicService.resourceId',
                    },
                ]),
            ],
        ])('should not pass validation in case %s', (_msg, invalidParams, expectedError) => {
            expect(() => {
                criminalRecordCertificateService.checkSendApplicationDataParams(invalidParams)
            }).toThrow(expectedError)
        })
    })

    describe('method `checkApplicationForPublicService`', () => {
        const validCertificate = {
            applicationId: randomUUID(),
            status: CriminalRecordCertificateStatus.applicationProcessing,
            receivingApplicationTime: new Date(),
        }
        const validCertificateModel = new criminalRecordCertificateModel(validCertificate)
        const resourceId = randomUUID()
        const { identifier: userIdentifier } = user

        it.each([
            [
                'and return true',
                { code: PublicServiceCode.damagedPropertyRecovery, resourceId },
                (): void => {
                    jest.spyOn(criminalRecordCertificateModel, 'findOne').mockResolvedValueOnce(validCertificateModel)
                    jest.spyOn(validCertificateModel, 'save').mockResolvedValueOnce(validCertificateModel)
                    jest.spyOn(eventBusMock, 'publish').mockResolvedValueOnce(true)
                },
                (): void => {
                    expect(criminalRecordCertificateModel.findOne).toHaveBeenCalledWith({
                        userIdentifier,
                        status: { $in: [CriminalRecordCertificateStatus.applicationProcessing, CriminalRecordCertificateStatus.done] },
                        'reason.code': '44',
                        type: CriminalRecordCertificateType.full,
                    })
                    expect(validCertificateModel.save).toHaveBeenCalledWith()
                },
                {
                    applicationId: validCertificate.applicationId,
                    hasOrderedCertificate: true,
                    status: CriminalCertificateUpdateEventStatus.Requested,
                },
            ],
            [
                'and return false in case certificate is not found',
                { code: PublicServiceCode.criminalRecordCertificate, resourceId },
                (): void => {
                    jest.spyOn(criminalRecordCertificateModel, 'findOne').mockResolvedValueOnce(null)
                },
                (): void => {
                    expect(criminalRecordCertificateModel.findOne).toHaveBeenCalledWith({
                        userIdentifier,
                        status: { $in: [CriminalRecordCertificateStatus.applicationProcessing, CriminalRecordCertificateStatus.done] },
                    })
                },
                { hasOrderedCertificate: false },
            ],
            [
                'and return false in case certificate is outdated',
                { code: PublicServiceCode.criminalRecordCertificate, resourceId },
                (): void => {
                    jest.spyOn(criminalRecordCertificateModel, 'findOne').mockResolvedValueOnce(
                        new criminalRecordCertificateModel({
                            ...validCertificate,
                            receivingApplicationTime: new Date(Date.now() - DurationMs.Day * 31),
                        }),
                    )
                },
                (): void => {
                    expect(criminalRecordCertificateModel.findOne).toHaveBeenCalledWith({
                        userIdentifier,
                        status: { $in: [CriminalRecordCertificateStatus.applicationProcessing, CriminalRecordCertificateStatus.done] },
                    })
                },
                { hasOrderedCertificate: false },
            ],
            [
                'and return true even when certificate status updated event is not triggered due to unacceptable status',
                { code: PublicServiceCode.damagedPropertyRecovery, resourceId },
                (): void => {
                    jest.spyOn(criminalRecordCertificateModel, 'findOne').mockResolvedValueOnce(
                        new criminalRecordCertificateModel({ ...validCertificate, status: CriminalRecordCertificateStatus.cancel }),
                    )
                },
                (): void => {
                    expect(criminalRecordCertificateModel.findOne).toHaveBeenCalledWith({
                        userIdentifier,
                        status: { $in: [CriminalRecordCertificateStatus.applicationProcessing, CriminalRecordCertificateStatus.done] },
                        'reason.code': '44',
                        type: CriminalRecordCertificateType.full,
                    })
                },
                {
                    hasOrderedCertificate: true,
                    applicationId: validCertificate.applicationId,
                    status: undefined,
                },
            ],
        ])('should pass checking %s', async (_msg, publicService, defineSpies, checkExpectations, expectedResult) => {
            defineSpies()

            expect(await criminalRecordCertificateService.checkApplicationForPublicService(userIdentifier, publicService)).toMatchObject(
                expectedResult,
            )

            checkExpectations()
        })
    })

    describe('method `checkApplicationsStatuses`', () => {
        const { identifier: userIdentifier } = user
        const { mobileUid } = testKit.session.getHeaders()
        const signature = 'signature'
        const applications = [
            {
                applicationId: randomUUID(),
                userIdentifier,
                mobileUid,
                notifications: { [randomUUID()]: new Date() },
                createdAt: new Date(),
            },
            {
                applicationId: randomUUID(),
                userIdentifier,
                mobileUid,
                notifications: { [randomUUID()]: new Date() },
                createdAt: new Date(),
                publicService: {
                    code: PublicServiceCode.criminalRecordCertificate,
                    resourceId: randomUUID(),
                },
            },
            {
                applicationId: randomUUID(),
                userIdentifier,
                mobileUid,
                notifications: {},
                createdAt: new Date(Date.now() - DurationMs.Day * (config.sevdeir.criminalRecordCertificate.applicationExpirationDays + 2)),
                publicService: {
                    code: PublicServiceCode.damagedPropertyRecovery,
                    resourceId: randomUUID(),
                },
            },
        ]

        it('should successfully check applications statuses', async () => {
            jest.spyOn(cryptoDocServiceClient, 'docGenerateSignature').mockResolvedValue({ signature })
            jest.spyOn(criminalRecordCertificateProviderMock, 'checkStatus')
                .mockResolvedValueOnce(CriminalRecordCertificateStatus.done)
                .mockResolvedValueOnce(CriminalRecordCertificateStatus.done)
                .mockResolvedValueOnce(CriminalRecordCertificateStatus.applicationProcessing)
            jest.spyOn(eventBusMock, 'publish').mockResolvedValueOnce(true)
            jest.spyOn(analyticsServiceMock, 'notifyRate').mockResolvedValueOnce()
            jest.spyOn(notificationServiceMock, 'createNotificationWithPushesByMobileUid').mockResolvedValueOnce()
            jest.spyOn(criminalRecordCertificateModel, 'updateMany')
                .mockResolvedValueOnce(<UpdateWriteOpResult>{ modifiedCount: 2 })
                .mockResolvedValueOnce(<UpdateWriteOpResult>{ modifiedCount: 1 })

            await criminalRecordCertificateService.checkApplicationsStatuses(applications)

            expect(cryptoDocServiceClient.docGenerateSignature).toHaveBeenCalledWith({
                contentBase64: Buffer.from(' ').toString('base64'),
                external: true,
            })
            expect(criminalRecordCertificateProviderMock.checkStatus).toHaveBeenCalledWith({
                requestId: applications[0].applicationId,
                signature,
            })
            expect(criminalRecordCertificateProviderMock.checkStatus).toHaveBeenCalledWith({
                requestId: applications[1].applicationId,
                signature,
            })
            expect(criminalRecordCertificateProviderMock.checkStatus).toHaveBeenCalledWith({
                requestId: applications[2].applicationId,
                signature,
            })
            expect(eventBusMock.publish).toHaveBeenCalledWith(InternalEvent.CriminalCertificateStatusUpdated, {
                publicServiceCode: applications[1]?.publicService?.code,
                userIdentifier,
                resourceId: applications[1]?.publicService?.resourceId,
                applicationId: applications[1].applicationId,
                status: CriminalRecordCertificateStatus.done,
            })
            expect(analyticsServiceMock.notifyRate).toHaveBeenCalledWith({
                userIdentifier,
                category: RatingCategory.PublicService,
                serviceCode: 'criminal-cert',
                resourceId: applications[0].applicationId,
            })
            expect(notificationServiceMock.createNotificationWithPushesByMobileUid).toHaveBeenLastCalledWith({
                templateCode: MessageTemplateCode.CriminalRecordCertificateApplicationDone,
                userIdentifier,
                mobileUid,
                resourceId: applications[0].applicationId,
            })
            expect(criminalRecordCertificateModel.updateMany).toHaveBeenCalledWith(
                { applicationId: { $in: [applications[0].applicationId, applications[1].applicationId] } },
                {
                    $set: {
                        status: CriminalRecordCertificateStatus.done,
                        receivingApplicationTime: new Date(),
                        [`notifications.${MessageTemplateCode.CriminalRecordCertificateApplicationDone}`]: new Date(),
                    },
                    $push: {
                        statusHistory: { status: CriminalRecordCertificateStatus.done, date: new Date() },
                    },
                },
            )
            expect(criminalRecordCertificateModel.updateMany).toHaveBeenCalledWith(
                { applicationId: { $in: [applications[2].applicationId] } },
                {
                    $set: {
                        status: CriminalRecordCertificateStatus.cancel,
                        [`notifications.${MessageTemplateCode.CriminalRecordCertificateApplicationRefused}`]: new Date(),
                    },
                    $push: {
                        statusHistory: { status: CriminalRecordCertificateStatus.cancel, date: new Date() },
                    },
                },
            )
            expect(loggerMock.info).toHaveBeenCalledWith('Updated applications: done 2; refused 1')
        })

        it('should successfully check applications status even if failed to check and send push notifications for some application in provided list', async () => {
            const rejectedError = new ServiceUnavailableError()

            jest.spyOn(cryptoDocServiceClient, 'docGenerateSignature').mockResolvedValue({ signature })
            jest.spyOn(criminalRecordCertificateProviderMock, 'checkStatus')
                .mockRejectedValueOnce(rejectedError)
                .mockResolvedValueOnce(CriminalRecordCertificateStatus.done)
                .mockResolvedValueOnce(CriminalRecordCertificateStatus.applicationProcessing)
            jest.spyOn(criminalRecordCertificateModel, 'updateMany')
                .mockResolvedValueOnce(<UpdateWriteOpResult>{ modifiedCount: 1 })
                .mockResolvedValueOnce(<UpdateWriteOpResult>{ modifiedCount: 1 })

            await criminalRecordCertificateService.checkApplicationsStatuses(applications, [])

            expect(cryptoDocServiceClient.docGenerateSignature).toHaveBeenCalledWith({
                contentBase64: Buffer.from(' ').toString('base64'),
                external: true,
            })
            expect(criminalRecordCertificateProviderMock.checkStatus).toHaveBeenCalledWith({
                requestId: applications[0].applicationId,
                signature,
            })
            expect(criminalRecordCertificateProviderMock.checkStatus).toHaveBeenCalledWith({
                requestId: applications[1].applicationId,
                signature,
            })
            expect(criminalRecordCertificateProviderMock.checkStatus).toHaveBeenCalledWith({
                requestId: applications[2].applicationId,
                signature,
            })
            expect(loggerMock.fatal).toHaveBeenCalledWith('Failed check application status with id and send push notifications', {
                applicationId: applications[0].applicationId,
                err: rejectedError,
            })
            expect(criminalRecordCertificateModel.updateMany).toHaveBeenCalledWith(
                { applicationId: { $in: [applications[1].applicationId] } },
                {
                    $set: {
                        status: CriminalRecordCertificateStatus.done,
                        receivingApplicationTime: new Date(),
                    },
                    $push: {
                        statusHistory: { status: CriminalRecordCertificateStatus.done, date: new Date() },
                    },
                },
            )
            expect(criminalRecordCertificateModel.updateMany).toHaveBeenCalledWith(
                { applicationId: { $in: [applications[2].applicationId] } },
                {
                    $set: {
                        status: CriminalRecordCertificateStatus.cancel,
                    },
                    $push: {
                        statusHistory: { status: CriminalRecordCertificateStatus.cancel, date: new Date() },
                    },
                },
            )
            expect(loggerMock.info).toHaveBeenCalledWith('Updated applications: done 1; refused 1')
        })

        it('should just update models in case all status checks are failed', async () => {
            const rejectedError = new ServiceUnavailableError()

            jest.spyOn(Promise, 'all').mockRejectedValueOnce(rejectedError)
            jest.spyOn(criminalRecordCertificateModel, 'updateMany')
                .mockResolvedValueOnce(<UpdateWriteOpResult>{ modifiedCount: 0 })
                .mockResolvedValueOnce(<UpdateWriteOpResult>{ modifiedCount: 0 })

            await criminalRecordCertificateService.checkApplicationsStatuses([], [])

            expect(Promise.all).toHaveBeenCalledWith([])
            expect(loggerMock.fatal).toHaveBeenCalledWith('Failed check applications status and send push notifications', {
                err: rejectedError,
            })
            expect(criminalRecordCertificateModel.updateMany).toHaveBeenCalledWith(
                { applicationId: { $in: [] } },
                {
                    $set: {
                        status: CriminalRecordCertificateStatus.done,
                        receivingApplicationTime: new Date(),
                    },
                    $push: {
                        statusHistory: { status: CriminalRecordCertificateStatus.done, date: new Date() },
                    },
                },
            )
            expect(criminalRecordCertificateModel.updateMany).toHaveBeenCalledWith(
                { applicationId: { $in: [] } },
                {
                    $set: {
                        status: CriminalRecordCertificateStatus.cancel,
                    },
                    $push: {
                        statusHistory: { status: CriminalRecordCertificateStatus.cancel, date: new Date() },
                    },
                },
            )
            expect(loggerMock.info).toHaveBeenCalledWith('Updated applications: done 0; refused 0')
        })
    })

    describe('method `downloadCertificateFiles`', () => {
        const applicationId = randomUUID()
        const validCertificate = {
            applicationId,
            status: CriminalRecordCertificateStatus.done,
            receivingApplicationTime: new Date(),
            createdAt: new Date(),
        }
        const validCertificateModel = new criminalRecordCertificateModel(validCertificate)
        const expectedFileName = `vytiah pro nesudymist vid ${moment(validCertificate.createdAt).format('YYYY-MM-DD')}`.replaceAll(' ', '_')
        const { identifier: userIdentifier } = user

        it('should successfully download certificate files', async () => {
            const signature = 'signature'
            const document = 'document-content'

            jest.spyOn(criminalRecordCertificateModel, 'findOne').mockResolvedValueOnce(validCertificateModel)
            jest.spyOn(cryptoDocServiceClient, 'docGenerateSignature').mockResolvedValueOnce({ signature })
            jest.spyOn(criminalRecordCertificateProviderMock, 'downloadCertificate').mockResolvedValueOnce({ document, signature })
            jest.spyOn(validCertificateModel, 'save').mockResolvedValueOnce(validCertificateModel)
            admZipStubs.toBuffer.mockReturnValueOnce({ toString: admZipStubs.toString })
            admZipStubs.toString.mockReturnValueOnce(document)

            expect(await criminalRecordCertificateService.downloadCertificateFiles(applicationId, user)).toEqual(document)

            expect(criminalRecordCertificateModel.findOne).toHaveBeenCalledWith({
                userIdentifier,
                applicationId,
                status: { $in: [CriminalRecordCertificateStatus.done] },
            })
            expect(cryptoDocServiceClient.docGenerateSignature).toHaveBeenCalledWith({
                contentBase64: Buffer.from(' ').toString('base64'),
                external: true,
            })
            expect(criminalRecordCertificateProviderMock.downloadCertificate).toHaveBeenCalledWith({
                requestId: applicationId,
                signature,
            })
            expect(admZipStubs.addFile).toHaveBeenCalledWith(`${expectedFileName}.pdf`, Buffer.from(document, 'base64'))
            expect(admZipStubs.addFile).toHaveBeenCalledWith(`${expectedFileName}.p7s`, Buffer.from(signature, 'base64'))
            expect(validCertificateModel.save).toHaveBeenCalledWith()
            expect(validCertificateModel.isDownloadAction).toBeTruthy()
            expect(admZipStubs.toBuffer).toHaveBeenCalledWith()
            expect(admZipStubs.toString).toHaveBeenCalledWith('base64')
        })

        it('should fail with error in case certificate not found', async () => {
            jest.spyOn(criminalRecordCertificateModel, 'findOne').mockResolvedValueOnce(null)

            await expect(async () => {
                await criminalRecordCertificateService.downloadCertificateFiles(applicationId, user)
            }).rejects.toEqual(new ModelNotFoundError(criminalRecordCertificateModel.modelName, applicationId))

            expect(criminalRecordCertificateModel.findOne).toHaveBeenCalledWith({
                userIdentifier,
                applicationId,
                status: { $in: [CriminalRecordCertificateStatus.done] },
            })
            expect(loggerMock.error).toHaveBeenCalledWith('Failed to find criminal certificate ready to download by id', { applicationId })
        })

        it('should fail with error in case document is not found by provider', async () => {
            const signature = 'signature'

            jest.spyOn(criminalRecordCertificateModel, 'findOne').mockResolvedValueOnce(validCertificateModel)
            jest.spyOn(cryptoDocServiceClient, 'docGenerateSignature').mockResolvedValueOnce({ signature })
            jest.spyOn(criminalRecordCertificateProviderMock, 'downloadCertificate').mockResolvedValueOnce({})

            await expect(async () => {
                await criminalRecordCertificateService.downloadCertificateFiles(applicationId, user)
            }).rejects.toEqual(new NotFoundError())

            expect(criminalRecordCertificateModel.findOne).toHaveBeenCalledWith({
                userIdentifier,
                applicationId,
                status: { $in: [CriminalRecordCertificateStatus.done] },
            })
            expect(cryptoDocServiceClient.docGenerateSignature).toHaveBeenCalledWith({
                contentBase64: Buffer.from(' ').toString('base64'),
                external: true,
            })
            expect(criminalRecordCertificateProviderMock.downloadCertificate).toHaveBeenCalledWith({
                requestId: applicationId,
                signature,
            })
        })
    })

    describe('method `downloadCertificatePdf`', () => {
        const applicationId = randomUUID()
        const validCertificate = {
            applicationId,
            status: CriminalRecordCertificateStatus.done,
            receivingApplicationTime: new Date(),
            createdAt: new Date(),
        }
        const validCertificateModel = new criminalRecordCertificateModel(validCertificate)
        const { identifier: userIdentifier } = user

        it('should successfully download certificate pdf', async () => {
            const signature = 'signature'
            const document = 'pdf-document-content'

            jest.spyOn(criminalRecordCertificateModel, 'findOne').mockResolvedValueOnce(validCertificateModel)
            jest.spyOn(cryptoDocServiceClient, 'docGenerateSignature').mockResolvedValueOnce({ signature })
            jest.spyOn(criminalRecordCertificateProviderMock, 'downloadCertificate').mockResolvedValueOnce({ document })
            jest.spyOn(validCertificateModel, 'save').mockResolvedValueOnce(validCertificateModel)

            expect(await criminalRecordCertificateService.downloadCertificatePdf(applicationId, user)).toEqual(document)

            expect(criminalRecordCertificateModel.findOne).toHaveBeenCalledWith({
                applicationId,
                status: { $in: [CriminalRecordCertificateStatus.done] },
                userIdentifier,
            })
            expect(cryptoDocServiceClient.docGenerateSignature).toHaveBeenCalledWith({
                contentBase64: Buffer.from(' ').toString('base64'),
                external: true,
            })
            expect(criminalRecordCertificateProviderMock.downloadCertificate).toHaveBeenCalledWith({
                requestId: applicationId,
                signature,
            })
            expect(validCertificateModel.save).toHaveBeenCalledWith()
            expect(validCertificateModel.isViewAction).toBeTruthy()
        })

        it('should fail with error in case certificate not found', async () => {
            jest.spyOn(criminalRecordCertificateModel, 'findOne').mockResolvedValueOnce(null)

            await expect(async () => {
                await criminalRecordCertificateService.downloadCertificatePdf(applicationId, user)
            }).rejects.toEqual(new ModelNotFoundError(criminalRecordCertificateModel.modelName, applicationId))

            expect(criminalRecordCertificateModel.findOne).toHaveBeenCalledWith({
                applicationId,
                status: { $in: [CriminalRecordCertificateStatus.done] },
                userIdentifier,
            })
            expect(loggerMock.error).toHaveBeenCalledWith('Failed to find criminal certificate ready to download by id', { applicationId })
        })

        it('should fail with error in case document is not found by provider', async () => {
            const signature = 'signature'

            jest.spyOn(criminalRecordCertificateModel, 'findOne').mockResolvedValueOnce(validCertificateModel)
            jest.spyOn(cryptoDocServiceClient, 'docGenerateSignature').mockResolvedValueOnce({ signature })
            jest.spyOn(criminalRecordCertificateProviderMock, 'downloadCertificate').mockResolvedValueOnce({})

            await expect(async () => {
                await criminalRecordCertificateService.downloadCertificatePdf(applicationId, user)
            }).rejects.toEqual(new NotFoundError())

            expect(criminalRecordCertificateModel.findOne).toHaveBeenCalledWith({
                applicationId,
                status: { $in: [CriminalRecordCertificateStatus.done] },
                userIdentifier,
            })
            expect(cryptoDocServiceClient.docGenerateSignature).toHaveBeenCalledWith({
                contentBase64: Buffer.from(' ').toString('base64'),
                external: true,
            })
            expect(criminalRecordCertificateProviderMock.downloadCertificate).toHaveBeenCalledWith({
                requestId: applicationId,
                signature,
            })
        })
    })

    describe('method `getApplicationBirthPlace`', () => {
        it('should successfully get application birth place by internal passport with registration', async () => {
            jest.spyOn(documentsServiceMock, 'getInternalPassportWithRegistration').mockResolvedValueOnce(internalPassportWithRegistration)

            const expectedResult = {
                birthPlaceDataScreen: {
                    title: 'Місце народження',
                    country: {
                        label: 'Країна',
                        hint: 'Оберіть країну',
                        value: 'Україна',
                        checkbox: 'Країни немає в списку',
                        otherCountry: {
                            label: 'Країна',
                            hint: 'Введіть назву країни самостійно',
                        },
                    },
                    city: {
                        label: 'Населений пункт',
                        hint: 'Наприклад: Ялта, Обухів, Василівка',
                        description: 'Введіть лише назву, без області та району',
                    },
                    nextScreen: CriminalRecordCertificateApplicationScreen.registrationPlace,
                },
            }

            const result = await criminalRecordCertificateService.getApplicationBirthPlace(user)

            expect(result).toEqual(expectedResult)

            expect(documentsServiceMock.getInternalPassportWithRegistration).toHaveBeenCalledWith(user, true)
        })

        it('should successfully get application birth place by internal passport with next screen `nationalities` in case nationalities is empty list', async () => {
            jest.spyOn(documentsServiceMock, 'getInternalPassportWithRegistration').mockResolvedValueOnce(
                <GetInternalPassportWithRegistrationResponse>{},
            )

            const expectedResult = {
                birthPlaceDataScreen: {
                    title: 'Місце народження',
                    country: {
                        label: 'Країна',
                        hint: 'Оберіть країну',
                        value: undefined,
                        checkbox: 'Країни немає в списку',
                        otherCountry: {
                            label: 'Країна',
                            hint: 'Введіть назву країни самостійно',
                        },
                    },
                    city: {
                        label: 'Населений пункт',
                        hint: 'Наприклад: Ялта, Обухів, Василівка',
                        description: 'Введіть лише назву, без області та району',
                    },
                    nextScreen: CriminalRecordCertificateApplicationScreen.nationalities,
                },
            }

            const result = await criminalRecordCertificateService.getApplicationBirthPlace(user)

            expect(result).toEqual(expectedResult)

            expect(documentsServiceMock.getInternalPassportWithRegistration).toHaveBeenCalledWith(user, true)
        })

        it('should fail with error in case unable to get internal passport with registration', async () => {
            const rejectedError = new ServiceUnavailableError()

            jest.spyOn(documentsServiceMock, 'getInternalPassportWithRegistration').mockRejectedValueOnce(rejectedError)

            await expect(async () => {
                await criminalRecordCertificateService.getApplicationBirthPlace(user)
            }).rejects.toEqual(
                new ServiceUnavailableError('Registry unavailable', ProcessCode.CriminalRecordCertificateSomeRegistryUnavailable),
            )

            expect(documentsServiceMock.getInternalPassportWithRegistration).toHaveBeenCalledWith(user, true)
        })
    })

    describe('method `getApplicationInfo`', () => {
        const { birthDay, identifier: userIdentifier, fName } = user
        const headers = testKit.session.getHeaders()
        const taxpayerCard = testKit.docs.generateDocument('taxpayer-card', { docStatus: DocStatus.Ok })

        it.each([
            [
                'application is on start stage and next screen is defined by public service code',
                PublicServiceCode.damagedPropertyRecovery,
                (): void => {
                    utilsStubs.isAvailable.mockReturnValueOnce(true)
                    utilsStubs.getAge.mockReturnValueOnce(15)
                    jest.spyOn(userServiceMock, 'getUserDocuments').mockResolvedValueOnce({
                        documents: [<UserDocument>(<unknown>{ ...taxpayerCard, documentType: 'taxpayer-card' })],
                    })
                    jest.spyOn(criminalRecordCertificateModel, 'countDocuments').mockResolvedValueOnce(0)
                },
                (): void => {
                    expect(utilsStubs.isAvailable).toHaveBeenCalledWith(publicServiceSettings, user, headers)
                    expect(utilsStubs.getAge).toHaveBeenCalledWith(birthDay)
                    expect(userServiceMock.getUserDocuments).toHaveBeenCalledWith(userIdentifier, [
                        { documentType: 'taxpayer-card', docStatus: [DocStatus.Ok, DocStatus.Confirming] },
                    ])
                    expect(criminalRecordCertificateModel.countDocuments).toHaveBeenCalledWith({
                        userIdentifier,
                        status: CriminalRecordCertificateStatus.applicationProcessing,
                    })
                },
                {
                    showContextMenu: true,
                    title: 'Вітаємо, Надія',
                    text: criminalRecordCertificateMapperMock.applicationStartMessage,
                    nextScreen: 'requester',
                },
            ],
            [
                'application is on start stage and next screen is default due to provided public service code does not have specific next screen',
                PublicServiceCode.criminalRecordCertificate,
                (): void => {
                    utilsStubs.isAvailable.mockReturnValueOnce(true)
                    utilsStubs.getAge.mockReturnValueOnce(15)
                    jest.spyOn(userServiceMock, 'getUserDocuments').mockResolvedValueOnce({
                        documents: [<UserDocument>(<unknown>{ ...taxpayerCard, documentType: 'taxpayer-card' })],
                    })
                    jest.spyOn(criminalRecordCertificateModel, 'countDocuments').mockResolvedValueOnce(0)
                },
                (): void => {
                    expect(utilsStubs.isAvailable).toHaveBeenCalledWith(publicServiceSettings, user, headers)
                    expect(utilsStubs.getAge).toHaveBeenCalledWith(birthDay)
                    expect(userServiceMock.getUserDocuments).toHaveBeenCalledWith(userIdentifier, [
                        { documentType: 'taxpayer-card', docStatus: [DocStatus.Ok, DocStatus.Confirming] },
                    ])
                    expect(criminalRecordCertificateModel.countDocuments).toHaveBeenCalledWith({
                        userIdentifier,
                        status: CriminalRecordCertificateStatus.applicationProcessing,
                    })
                },
                {
                    showContextMenu: true,
                    title: 'Вітаємо, Надія',
                    text: criminalRecordCertificateMapperMock.applicationStartMessage,
                    nextScreen: 'reasons',
                },
            ],
            [
                'application is on start stage and next screen is default due to missing public service code',
                undefined,
                (): void => {
                    utilsStubs.isAvailable.mockReturnValueOnce(true)
                    utilsStubs.getAge.mockReturnValueOnce(15)
                    jest.spyOn(userServiceMock, 'getUserDocuments').mockResolvedValueOnce({
                        documents: [<UserDocument>(<unknown>{ ...taxpayerCard, documentType: 'taxpayer-card' })],
                    })
                    jest.spyOn(criminalRecordCertificateModel, 'countDocuments').mockResolvedValueOnce(0)
                },
                (): void => {
                    expect(utilsStubs.isAvailable).toHaveBeenCalledWith(publicServiceSettings, user, headers)
                    expect(utilsStubs.getAge).toHaveBeenCalledWith(birthDay)
                    expect(userServiceMock.getUserDocuments).toHaveBeenCalledWith(userIdentifier, [
                        { documentType: 'taxpayer-card', docStatus: [DocStatus.Ok, DocStatus.Confirming] },
                    ])
                    expect(criminalRecordCertificateModel.countDocuments).toHaveBeenCalledWith({
                        userIdentifier,
                        status: CriminalRecordCertificateStatus.applicationProcessing,
                    })
                },
                {
                    showContextMenu: true,
                    title: 'Вітаємо, Надія',
                    text: criminalRecordCertificateMapperMock.applicationStartMessage,
                    nextScreen: 'reasons',
                },
            ],
            [
                'service is not active',
                PublicServiceCode.criminalRecordCertificate,
                (): void => {
                    utilsStubs.isAvailable.mockReturnValueOnce(false)
                },
                (): void => {
                    expect(utilsStubs.isAvailable).toHaveBeenCalledWith(publicServiceSettings, user, headers)
                },
                {
                    title: 'Вітаємо, Надія',
                    attentionMessage: criminalRecordCertificateMapperMock.serviceIsNotActiveAttentionMessage,
                },
            ],
            [
                'unsuitable age',
                PublicServiceCode.criminalRecordCertificate,
                (): void => {
                    utilsStubs.isAvailable.mockReturnValueOnce(true)
                    utilsStubs.getAge.mockReturnValueOnce(13)
                },
                (): void => {
                    expect(utilsStubs.isAvailable).toHaveBeenCalledWith(publicServiceSettings, user, headers)
                    expect(utilsStubs.getAge).toHaveBeenCalledWith(birthDay)
                },
                {
                    title: 'Вітаємо, Надія',
                    attentionMessage: criminalRecordCertificateMapperMock.unsuitableAgeAttentionMessage,
                },
            ],
            [
                'confirming taxpayer card',
                PublicServiceCode.criminalRecordCertificate,
                (): void => {
                    utilsStubs.isAvailable.mockReturnValueOnce(true)
                    utilsStubs.getAge.mockReturnValueOnce(15)
                    jest.spyOn(userServiceMock, 'getUserDocuments').mockResolvedValueOnce({
                        documents: [<UserDocument>(<unknown>{
                                ...testKit.docs.generateDocument('taxpayer-card', { docStatus: DocStatus.Confirming }),
                                documentType: 'taxpayer-card',
                            })],
                    })
                },
                (): void => {
                    expect(utilsStubs.isAvailable).toHaveBeenCalledWith(publicServiceSettings, user, headers)
                    expect(utilsStubs.getAge).toHaveBeenCalledWith(birthDay)
                    expect(userServiceMock.getUserDocuments).toHaveBeenCalledWith(userIdentifier, [
                        { documentType: 'taxpayer-card', docStatus: [DocStatus.Ok, DocStatus.Confirming] },
                    ])
                },
                {
                    title: 'Вітаємо, Надія',
                    attentionMessage: criminalRecordCertificateMapperMock.confirmingTaxpayerCardAttentionMessage,
                },
            ],
            [
                'missing taxpayer card',
                PublicServiceCode.criminalRecordCertificate,
                (): void => {
                    utilsStubs.isAvailable.mockReturnValueOnce(true)
                    utilsStubs.getAge.mockReturnValueOnce(15)
                    jest.spyOn(userServiceMock, 'getUserDocuments').mockResolvedValueOnce({
                        documents: [],
                    })
                },
                (): void => {
                    expect(utilsStubs.isAvailable).toHaveBeenCalledWith(publicServiceSettings, user, headers)
                    expect(utilsStubs.getAge).toHaveBeenCalledWith(birthDay)
                    expect(userServiceMock.getUserDocuments).toHaveBeenCalledWith(userIdentifier, [
                        { documentType: 'taxpayer-card', docStatus: [DocStatus.Ok, DocStatus.Confirming] },
                    ])
                },
                {
                    title: 'Вітаємо, Надія',
                    attentionMessage: criminalRecordCertificateMapperMock.missingTaxpayerCardAttentionMessage,
                },
            ],
            [
                'processing application has already started',
                PublicServiceCode.criminalRecordCertificate,
                (): void => {
                    utilsStubs.isAvailable.mockReturnValueOnce(true)
                    utilsStubs.getAge.mockReturnValueOnce(15)
                    jest.spyOn(userServiceMock, 'getUserDocuments').mockResolvedValueOnce({
                        documents: [<UserDocument>(<unknown>{ ...taxpayerCard, documentType: 'taxpayer-card' })],
                    })
                    jest.spyOn(criminalRecordCertificateModel, 'countDocuments').mockResolvedValueOnce(1)
                },
                (): void => {
                    expect(utilsStubs.isAvailable).toHaveBeenCalledWith(publicServiceSettings, user, headers)
                    expect(utilsStubs.getAge).toHaveBeenCalledWith(birthDay)
                    expect(userServiceMock.getUserDocuments).toHaveBeenCalledWith(userIdentifier, [
                        { documentType: 'taxpayer-card', docStatus: [DocStatus.Ok, DocStatus.Confirming] },
                    ])
                    expect(criminalRecordCertificateModel.countDocuments).toHaveBeenCalledWith({
                        userIdentifier,
                        status: CriminalRecordCertificateStatus.applicationProcessing,
                    })
                },
                {
                    title: 'Вітаємо, Надія',
                    attentionMessage: criminalRecordCertificateMapperMock.processingApplicationExistsMessage,
                },
            ],
        ])(
            'should successfully get application info when %s',
            async (_msg, publicService, defineSpies, checkExpectations, expectedResult) => {
                defineSpies()
                jest.spyOn(publicServiceCatalogClient, 'getPublicServiceSettingsV2').mockResolvedValueOnce(publicServiceSettings)
                utilsStubs.getGreeting.mockReturnValueOnce(`Вітаємо, ${fName}`)

                const result = await criminalRecordCertificateService.getApplicationInfo(user, headers, publicService)

                expect(result).toEqual(expectedResult)

                checkExpectations()

                expect(publicServiceCatalogClient.getPublicServiceSettingsV2).toHaveBeenCalledWith({
                    code: PublicServiceCode.criminalRecordCertificate,
                })
                expect(utilsStubs.getGreeting).toHaveBeenCalledWith(fName)
            },
        )
    })

    describe('method `getApplicationNationalities`', () => {
        it('should successfully get application nationalities by internal passport with registration', async () => {
            jest.spyOn(documentsServiceMock, 'getInternalPassportWithRegistration').mockResolvedValueOnce(internalPassportWithRegistration)

            const expectedResult = {
                nationalitiesScreen: {
                    title: 'Громадянство',
                    attentionMessage: {
                        icon: '☝️',
                        text: 'Вкажіть лише поточне громадянство, попередні вказувати не потрібно.',
                        parameters: [],
                    },
                    country: {
                        label: 'Країна',
                        hint: 'Оберіть країну',
                        addAction: {
                            icon: '',
                            name: 'Додати громадянство',
                        },
                    },
                    maxNationalitiesCount: 2,
                    nextScreen: CriminalRecordCertificateApplicationScreen.registrationPlace,
                },
            }

            const result = await criminalRecordCertificateService.getApplicationNationalities(user)

            expect(result).toEqual(expectedResult)

            expect(documentsServiceMock.getInternalPassportWithRegistration).toHaveBeenCalledWith(user, true)
        })

        it('should successfully get application nationalities by internal passport with registration and next screen `contacts`', async () => {
            jest.spyOn(documentsServiceMock, 'getInternalPassportWithRegistration').mockResolvedValueOnce({
                ...internalPassportWithRegistration,
                registration: {
                    ...internalPassportWithRegistration.registration,
                    address: {
                        ...internalPassportWithRegistration.registration?.address,
                        settlementType: 'м',
                        settlementName: 'Київ',
                    },
                },
            })

            const expectedResult = {
                nationalitiesScreen: {
                    title: 'Громадянство',
                    attentionMessage: {
                        icon: '☝️',
                        text: 'Вкажіть лише поточне громадянство, попередні вказувати не потрібно.',
                        parameters: [],
                    },
                    country: {
                        label: 'Країна',
                        hint: 'Оберіть країну',
                        addAction: {
                            icon: '',
                            name: 'Додати громадянство',
                        },
                    },
                    maxNationalitiesCount: 2,
                    nextScreen: CriminalRecordCertificateApplicationScreen.contacts,
                },
            }

            const result = await criminalRecordCertificateService.getApplicationNationalities(user)

            expect(result).toEqual(expectedResult)

            expect(documentsServiceMock.getInternalPassportWithRegistration).toHaveBeenCalledWith(user, true)
        })
    })

    describe('method `getApplicationReasons`', () => {
        it('should successfully get application reasons', () => {
            const result = criminalRecordCertificateService.getApplicationReasons()

            expect(result).toEqual({
                title: 'Мета запиту',
                subtitle: 'Для чого вам потрібен витяг?',
                reasons: [
                    {
                        code: '1',
                        name: "Усиновлення, установлення опіки (піклування), створення прийомної сім'ї або дитячого будинку сімейного типу",
                    },
                    {
                        code: '2',
                        name: 'Оформлення візи для виїзду за кордон',
                    },
                    {
                        code: '56',
                        name: 'Надання до установ іноземних держав',
                    },
                    {
                        code: '5',
                        name: 'Оформлення на роботу',
                    },
                    {
                        code: '55',
                        name: 'Оформлення дозволу на зброю, оформлення ліцензії на роботу з вибуховими речовинами',
                    },
                    {
                        code: '7',
                        name: 'Оформлення ліцензії на роботу з наркотичними засобами, психотропними речовинами та прекурсорами',
                    },
                    {
                        code: '37',
                        name: 'Оформлення участі в процедурі закупівель',
                    },
                    {
                        code: '9',
                        name: 'Оформлення громадянства',
                    },
                    {
                        code: '63',
                        name: 'Подання до територіального центру комплектування та соціальної підтримки',
                    },
                    {
                        code: '44',
                        name: "Пред'явлення за місцем вимоги",
                    },
                ],
            })
        })
    })

    describe('method `getApplicationRequester`', () => {
        it('should successfully get application requester by internal passport with registration', async () => {
            const { lName, fName, mName } = user
            const fullName = `${lName} ${fName} ${mName}`

            jest.spyOn(documentsServiceMock, 'getInternalPassportWithRegistration').mockResolvedValueOnce(internalPassportWithRegistration)
            utilsStubs.getUserFullName.mockReturnValueOnce(fullName)

            const expectedResult = {
                requesterDataScreen: {
                    title: 'Зміна особистих даних',
                    attentionMessage: {
                        icon: '☝️️',
                        text: 'Вкажіть свої попередні ПІБ, якщо змінювали їх. Це потрібно для детальнішого пошуку даних у реєстрах.',
                        parameters: [],
                    },
                    fullName: {
                        label: 'Прізвище, імʼя, по батькові',
                        value: fullName,
                    },
                    nextScreen: CriminalRecordCertificateApplicationScreen.birthPlace,
                },
            }

            const result = await criminalRecordCertificateService.getApplicationRequester(user)

            expect(result).toEqual(expectedResult)

            expect(documentsServiceMock.getInternalPassportWithRegistration).toHaveBeenCalledWith(user, true)
            expect(utilsStubs.getUserFullName).toHaveBeenCalledWith(user)
        })
    })

    describe('method `getApplicationTypes`', () => {
        it('should successfully get application types', () => {
            expect(criminalRecordCertificateService.getApplicationTypes()).toEqual({
                title: 'Тип витягу',
                subtitle: 'Який тип витягу вам потрібен?',
                types: criminalRecordCertificateProviderMock.types,
            })
        })
    })

    describe('method `getContacts`', () => {
        it('should successfully get contacts', () => {
            const { phoneNumber, email } = user

            expect(criminalRecordCertificateService.getContacts(user)).toEqual({
                title: 'Контактні дані',
                text: 'Дані заповнені з BankID. Перевірте їх, якщо потрібно – виправте.',
                attentionMessage: undefined,
                phoneNumber,
                email,
            })
        })
    })

    describe('method `getCriminalRecordCertificateById`', () => {
        const headers = testKit.session.getHeaders()
        const { identifier: userIdentifier } = user
        const applicationId = randomUUID()
        const validCertificate = {
            userIdentifier,
            applicationId,
            status: CriminalRecordCertificateStatus.done,
            receivingApplicationTime: new Date(),
            statusHistory: [{ status: CriminalRecordCertificateStatus.done, date: new Date() }],
        }
        const ratingFormResponse = {
            ratingStartsAtUnixTime: Date.now(),
            ratingForm: {
                comment: {
                    hint: 'hint',
                    label: 'label',
                },
                mainButton: 'Main button',
                rating: {
                    items: [],
                    label: 'rating',
                },
                title: 'title',
                resourceId: randomUUID(),
            },
        }
        const applicationDetails = {
            title: 'Запит на витяг про несудимість',
            statusMessage: {
                title: 'Запит полетів в обробку',
                text: 'Більшість запитів опрацьовуються автоматично, а підготовка витягу триває кілька хвилин. Проте часом дані потребують додаткової перевірки. Тоді витяг готують вручну. Зазвичай це триває до 10 днів, інколи — до 30 календарних днів. Будь ласка, очікуйте на сповіщення про результат.',
                icon: '⏳',
                parameters: [],
            },
            status: CriminalRecordCertificateStatus.applicationProcessing,
            loadActions: [],
        }

        it.each([
            [
                'rating form exists',
                new criminalRecordCertificateModel(validCertificate),
                {
                    navigationPanel: {
                        contextMenu: [],
                    },
                    ...applicationDetails,
                    contextMenu: [],
                    ratingForm: ratingFormResponse.ratingForm,
                },
            ],
            [
                'rating form does not exist due to certificate status is not `done`',
                new criminalRecordCertificateModel({ ...validCertificate, status: CriminalRecordCertificateStatus.applicationProcessing }),
                {
                    navigationPanel: {
                        contextMenu: [],
                    },
                    ...applicationDetails,
                    contextMenu: [],
                    ratingForm: undefined,
                },
            ],
            [
                'rating form does not exist due to inability to find `done` status in certificate status history',
                new criminalRecordCertificateModel({ ...validCertificate, statusHistory: [] }),
                {
                    navigationPanel: {
                        contextMenu: [],
                    },
                    ...applicationDetails,
                    contextMenu: [],
                    ratingForm: undefined,
                },
            ],
        ])('should successfully get criminal record certificate by id when %s', async (_msg, validCertificateModel, expectedResult) => {
            const contextMenu = undefined

            jest.spyOn(criminalRecordCertificateModel, 'findOne').mockResolvedValueOnce(validCertificateModel)
            jest.spyOn(publicServiceCatalogClient, 'getPublicServiceSettingsV2').mockResolvedValueOnce(publicServiceSettings)
            jest.spyOn(analyticsServiceMock, 'getRatingForm').mockResolvedValueOnce(ratingFormResponse)
            utilsStubs.extractContextMenu.mockReturnValueOnce(contextMenu)
            utilsStubs.extractNavigationPanel.mockReturnValueOnce({
                contextMenu: [],
            })
            jest.spyOn(criminalRecordCertificateMapperMock, 'toApplicationDetails').mockReturnValueOnce(applicationDetails)

            expect(await criminalRecordCertificateService.getCriminalRecordCertificateById(user, headers, applicationId)).toEqual(
                expectedResult,
            )

            expect(criminalRecordCertificateModel.findOne).toHaveBeenCalledWith({
                userIdentifier,
                applicationId,
                status: { $in: [CriminalRecordCertificateStatus.applicationProcessing, CriminalRecordCertificateStatus.done] },
            })
            expect(publicServiceCatalogClient.getPublicServiceSettingsV2).toHaveBeenCalledWith({
                code: PublicServiceCode.criminalRecordCertificate,
            })
            expect(analyticsServiceMock.getRatingForm).toHaveBeenCalledWith({
                userIdentifier,
                statusDate: validCertificate.statusHistory[0].date,
                category: RatingCategory.PublicService,
                serviceCode: 'criminal-cert',
                resourceId: validCertificate.applicationId,
            })
            expect(utilsStubs.extractContextMenu).toHaveBeenCalledWith(publicServiceSettings, headers)
            expect(utilsStubs.extractNavigationPanel).toHaveBeenCalledWith(publicServiceSettings, headers)
            expect(criminalRecordCertificateMapperMock.toApplicationDetails).toHaveBeenCalledWith(validCertificateModel)
        })

        it('should fail with error in case certificate not found', async () => {
            jest.spyOn(criminalRecordCertificateModel, 'findOne').mockResolvedValueOnce(null)

            await expect(async () => {
                await criminalRecordCertificateService.getCriminalRecordCertificateById(user, headers, applicationId)
            }).rejects.toEqual(new ModelNotFoundError(criminalRecordCertificateModel.modelName, applicationId))

            expect(criminalRecordCertificateModel.findOne).toHaveBeenCalledWith({
                userIdentifier,
                applicationId,
                status: { $in: [CriminalRecordCertificateStatus.applicationProcessing, CriminalRecordCertificateStatus.done] },
            })
            expect(loggerMock.error).toHaveBeenCalledWith('Failed to find criminal certificate by id', { applicationId })
        })
    })

    describe('method `getCriminalRecordCertificatesByStatus`', () => {
        const headers = testKit.session.getHeaders()
        const { identifier: userIdentifier } = user
        const applicationId = randomUUID()
        const validProcessingCertificate = {
            userIdentifier,
            applicationId,
            status: CriminalRecordCertificateStatus.applicationProcessing,
            receivingApplicationTime: new Date(),
        }
        const certificatesToCheck = [new criminalRecordCertificateModel(validProcessingCertificate)]
        const status = CriminalRecordCertificateStatus.done
        const statusFilterInfo = {
            code: status,
            name: 'Готові',
        }
        const navigationPanel = {
            contextMenu: [],
        }

        it('should successfully get certificates by status', async () => {
            const validDoneCertificateModel = new criminalRecordCertificateModel({
                userIdentifier,
                applicationId,
                status: CriminalRecordCertificateStatus.done,
                receivingApplicationTime: new Date(),
            })
            const skip = 0
            const limit = 10
            const certificates = [
                {
                    applicationId,
                    creationDate: moment().format(config.app.dateFormat),
                    reason: 'reason',
                    status: CriminalRecordCertificateStatus.done,
                    type: 'type',
                },
            ]
            const sortSpy = jest.fn()
            const skipSpy = jest.fn()
            const limitSpy = jest.fn()

            jest.spyOn(criminalRecordCertificateMapperMock, 'toStatusFilterInfo').mockReturnValueOnce(statusFilterInfo)
            jest.spyOn(criminalRecordCertificateModel, 'find').mockResolvedValueOnce(certificatesToCheck)
            jest.spyOn(criminalRecordCertificateService, 'checkApplicationsStatuses').mockResolvedValueOnce()
            jest.spyOn(criminalRecordCertificateModel, 'countDocuments').mockResolvedValueOnce(1)
            jest.spyOn(publicServiceCatalogClient, 'getPublicServiceSettingsV2').mockResolvedValueOnce(publicServiceSettings)
            utilsStubs.extractNavigationPanel.mockReturnValueOnce(navigationPanel)
            limitSpy.mockResolvedValueOnce([validDoneCertificateModel])
            skipSpy.mockReturnValueOnce({ limit: limitSpy })
            sortSpy.mockReturnValueOnce({ skip: skipSpy })
            jest.spyOn(criminalRecordCertificateModel, 'find').mockReturnValueOnce(<
                Query<unknown[], unknown, unknown, CriminalRecordCertificate, 'find'>
            >(<unknown>{ sort: sortSpy }))
            jest.spyOn(criminalRecordCertificateMapperMock, 'toResponseItem').mockReturnValueOnce(certificates[0])

            expect(await criminalRecordCertificateService.getCriminalRecordCertificatesByStatus(user, headers, status, limit)).toEqual({
                navigationPanel,
                certificatesStatus: statusFilterInfo,
                certificates,
                total: 1,
            })

            expect(criminalRecordCertificateMapperMock.toStatusFilterInfo).toHaveBeenCalledWith(status)
            expect(criminalRecordCertificateModel.find).toHaveBeenCalledWith({
                userIdentifier,
                status: CriminalRecordCertificateStatus.applicationProcessing,
            })
            expect(criminalRecordCertificateService.checkApplicationsStatuses).toHaveBeenCalledWith(certificatesToCheck, [])
            expect(criminalRecordCertificateModel.countDocuments).toHaveBeenCalledWith({ userIdentifier, status })
            expect(publicServiceCatalogClient.getPublicServiceSettingsV2).toHaveBeenCalledWith({
                code: PublicServiceCode.criminalRecordCertificate,
            })
            expect(utilsStubs.extractNavigationPanel).toHaveBeenCalledWith(publicServiceSettings, headers)
            expect(criminalRecordCertificateModel.find).toHaveBeenCalledWith({ userIdentifier, status })
            expect(sortSpy).toHaveBeenCalledWith({ _id: -1 })
            expect(skipSpy).toHaveBeenCalledWith(skip)
            expect(limitSpy).toHaveBeenCalledWith(limit)
            expect(criminalRecordCertificateMapperMock.toResponseItem).toHaveBeenCalledWith(validDoneCertificateModel)
        })

        it('should get empty list of certificates by status', async () => {
            jest.spyOn(criminalRecordCertificateMapperMock, 'toStatusFilterInfo').mockReturnValueOnce(statusFilterInfo)
            jest.spyOn(criminalRecordCertificateModel, 'find').mockResolvedValueOnce(certificatesToCheck)
            jest.spyOn(criminalRecordCertificateService, 'checkApplicationsStatuses').mockResolvedValueOnce()
            jest.spyOn(criminalRecordCertificateModel, 'countDocuments').mockResolvedValueOnce(0)
            jest.spyOn(publicServiceCatalogClient, 'getPublicServiceSettingsV2').mockResolvedValueOnce(publicServiceSettings)
            utilsStubs.extractNavigationPanel.mockReturnValueOnce(navigationPanel)

            expect(await criminalRecordCertificateService.getCriminalRecordCertificatesByStatus(user, headers, status, 10)).toEqual({
                navigationPanel,
                certificatesStatus: statusFilterInfo,
                stubMessage: {
                    icon: '🤷‍♂️',
                    text: 'Наразі немає готових витягів. \nМи повідомимо, коли замовлені витяги будуть готові.',
                    parameters: [],
                },
                certificates: [],
                total: 0,
            })

            expect(criminalRecordCertificateMapperMock.toStatusFilterInfo).toHaveBeenCalledWith(status)
            expect(criminalRecordCertificateModel.find).toHaveBeenCalledWith({
                userIdentifier,
                status: CriminalRecordCertificateStatus.applicationProcessing,
            })
            expect(criminalRecordCertificateService.checkApplicationsStatuses).toHaveBeenCalledWith(certificatesToCheck, [])
            expect(criminalRecordCertificateModel.countDocuments).toHaveBeenCalledWith({ userIdentifier, status })
            expect(publicServiceCatalogClient.getPublicServiceSettingsV2).toHaveBeenCalledWith({
                code: PublicServiceCode.criminalRecordCertificate,
            })
            expect(utilsStubs.extractNavigationPanel).toHaveBeenCalledWith(publicServiceSettings, headers)
        })
    })

    describe('method `prepareTasksToCheckApplicationsStatus`', () => {
        it('should successfully prepare tasks to check applications status', async () => {
            const cursorSpy = jest.fn()
            const applications = [
                new criminalRecordCertificateModel({}),
                new criminalRecordCertificateModel({}),
                new criminalRecordCertificateModel({}),
                new criminalRecordCertificateModel({}),
                new criminalRecordCertificateModel({}),
            ]

            cursorSpy.mockReturnValueOnce(
                (async function* (): unknown {
                    yield applications[0]
                    yield applications[1]
                    yield applications[2]
                    yield applications[3]
                    yield applications[4]
                })(),
            )

            jest.spyOn(criminalRecordCertificateModel, 'find').mockReturnValueOnce(<
                Query<unknown[], unknown, unknown, CriminalRecordCertificate, 'find'>
            >(<unknown>{ cursor: cursorSpy }))
            jest.spyOn(taskMock, 'publish').mockResolvedValue(true)

            await criminalRecordCertificateService.prepareTasksToCheckApplicationsStatus()

            expect(criminalRecordCertificateModel.find).toHaveBeenCalledWith(
                { status: CriminalRecordCertificateStatus.applicationProcessing },
                {
                    applicationId: 1,
                    mobileUid: 1,
                    userIdentifier: 1,
                    notifications: 1,
                    publicService: 1,
                    createdAt: 1,
                },
            )
            expect(cursorSpy).toHaveBeenCalledWith()
            expect(taskMock.publish).toHaveBeenCalledWith(
                ServiceTask.CheckCriminalRecordCertificateApplications,
                {
                    applications: [applications[0], applications[1], applications[2]],
                },
                0,
            )
            expect(taskMock.publish).toHaveBeenCalledWith(
                ServiceTask.CheckCriminalRecordCertificateApplications,
                {
                    applications: [applications[3], applications[4]],
                },
                config.sevdeir.criminalRecordCertificate.checkIntervalMs,
            )
            expect(loggerMock.info).toHaveBeenCalledWith('Prepared 1 batches to check criminal record certificate status')
        })
    })

    describe('method `sendApplication`', () => {
        const headers = testKit.session.getHeaders()
        const { identifier: userIdentifier, phoneNumber, email, fName, lName, mName, birthDay, itn, gender } = user
        const { mobileUid } = headers

        const applicationData = {
            nationalities: [],
            phoneNumber,
            email,
            reasonId: '5',
            certificateType: CriminalRecordCertificateType.full,
            registrationAddressId: randomUUID(),
            birthPlace: {
                city: 'City',
                country: 'Country',
            },
        }
        const registrationAddress = {
            address: {},
        }
        const requestData = {
            itn,
            reasonId: '5',
            certificateType: CriminalRecordCertOrderType.Full.toLowerCase(),
            firstName: fName,
            lastName: lName,
            middleName: mName,
            previousFirstName: undefined,
            previousLastName: undefined,
            previousMiddleName: undefined,
            gender: gender.toLowerCase(),
            birthDate: birthDay,
            birthCountry: 'Country',
            birthCity: 'City',
            registrationCountry: undefined,
            registrationRegion: undefined,
            registrationDistrict: undefined,
            registrationCity: undefined,
            nationalities: ['Україна'],
            nationalitiesAlfa3: ['UKR'],
            email,
            phoneNumber,
        }
        const providerRequest = {
            firstName: fName,
            lastName: lName,
            middleName: mName,
            firstNameChanged: false,
            lastNameChanged: false,
            middleNameChanged: false,
            gender: <CriminalRecordCertOrderGender>requestData.gender,
            birthDate: birthDay,
            birthCountry: requestData.birthCountry,
            birthRegion: 'Region',
            birthDistrict: 'District',
            birthCity: requestData.birthCity,
            registrationCountry: 'Country',
            registrationRegion: 'Region',
            registrationDistrict: 'District',
            registrationCity: 'City',
            nationality: requestData.nationalities[0],
            phone: phoneNumber,
            type: <CriminalRecordCertOrderType>requestData.certificateType,
            purpose: requestData.reasonId,
            clientId: randomUUID(),
        }
        const signature = 'signature'
        const sentApplicationId = 11111111111
        const applicationId = String(11111111111)
        const sendStatus = CriminalRecordCertOrderStatus.Completed
        const status = CriminalRecordCertificateStatus.done

        it.each([
            [
                'nationalities are defined by internal passport',
                { ...registrationAddress },
                { ...requestData },
                {
                    internalPassport: <InternalPassport>testKit.docs.generateDocument(IdentityDocumentType.InternalPassport),
                    identityType: IdentityDocumentType.InternalPassport,
                },
                {
                    ...requestData,
                },
                {
                    applicationId,
                    processCode: ProcessCode.CriminalRecordCertificateHasBeenSent,
                },
            ],
            [
                'residence permit permanent not found',
                { ...registrationAddress },
                {
                    ...requestData,
                    nationalitiesAlfa3: [],
                },
                {
                    identityType: IdentityDocumentType.ResidencePermitPermanent,
                },
                {
                    ...requestData,
                    nationalities: [],
                    nationalitiesAlfa3: undefined,
                },
                {
                    applicationId,
                    processCode: ProcessCode.CriminalRecordCertificateHasBeenSent,
                },
            ],
            [
                'nationalities are defined by residence permit permanent',
                { ...registrationAddress },
                {
                    ...requestData,
                    nationalitiesAlfa3: ['BTN', 'GRL'],
                    nationalities: ['Бутан', 'Гренландія'],
                    registrationCountry: 'Україна',
                },
                {
                    residencePermit: <ResidencePermit>testKit.docs.generateDocument('residence-permit'),
                    identityType: IdentityDocumentType.ResidencePermitPermanent,
                },
                {
                    ...requestData,
                    nationalitiesAlfa3: ['BTN', 'GRL'],
                    nationalities: ['Бутан', 'Гренландія'],
                    registrationCountry: 'Україна',
                },
                {
                    applicationId,
                    processCode: ProcessCode.CriminalRecordCertificateHasBeenSent,
                },
            ],
            [
                'registration district exists but registration city does not exist in address',
                { ...registrationAddress, address: { district: { value: 'District' } } },
                {
                    ...requestData,
                },
                {
                    internalPassport: <InternalPassport>testKit.docs.generateDocument(IdentityDocumentType.InternalPassport),
                    identityType: IdentityDocumentType.InternalPassport,
                },
                {
                    ...requestData,
                },
                {
                    applicationId,
                    processCode: ProcessCode.CriminalRecordCertificateHasBeenSent,
                },
            ],
            [
                'registration region exists but registration district and city does not exist in address',
                { ...registrationAddress, address: { region: { value: 'Region' } } },
                {
                    ...requestData,
                },
                {
                    internalPassport: <InternalPassport>testKit.docs.generateDocument(IdentityDocumentType.InternalPassport),
                    identityType: IdentityDocumentType.InternalPassport,
                },
                {
                    ...requestData,
                },
                {
                    applicationId,
                    processCode: ProcessCode.CriminalRecordCertificateHasBeenSent,
                },
            ],
        ])(
            'should successfully send criminal certificate application when %s',
            async (_msg, actualRegistrationAddress, actualRequestData, actualIdentityDocument, expectedRequestData, expectedResult) => {
                jest.spyOn(criminalRecordCertificateModel, 'countDocuments').mockResolvedValueOnce(0)
                jest.spyOn(addressServiceMock, 'getPublicServiceAddress').mockResolvedValueOnce(actualRegistrationAddress)
                jest.spyOn(documentsServiceMock, 'getInternalPassportWithRegistration').mockResolvedValueOnce(
                    <GetInternalPassportWithRegistrationResponse>{},
                )
                jest.spyOn(documentsServiceMock, 'getIdentityDocument').mockResolvedValueOnce(actualIdentityDocument)
                jest.spyOn(criminalRecordCertificateMapperMock, 'toProviderRequest').mockReturnValueOnce(providerRequest)
                jest.spyOn(cryptoDocServiceClient, 'docGenerateSignature').mockResolvedValueOnce({ signature })
                jest.spyOn(criminalRecordCertificateProviderMock, 'sendApplication').mockResolvedValueOnce({
                    id: sentApplicationId,
                    status: sendStatus,
                })
                jest.spyOn(criminalRecordCertificateModel, 'create').mockResolvedValueOnce([])
                jest.spyOn(notificationServiceMock, 'createNotificationWithPushesByMobileUid').mockResolvedValueOnce()
                jest.spyOn(analyticsServiceMock, 'notifyRate').mockResolvedValueOnce()

                expect(await criminalRecordCertificateService.sendApplication(user, headers, applicationData)).toEqual(expectedResult)

                expect(criminalRecordCertificateModel.countDocuments).toHaveBeenCalledWith({
                    userIdentifier,
                    status: CriminalRecordCertificateStatus.applicationProcessing,
                })
                expect(addressServiceMock.getPublicServiceAddress).toHaveBeenCalledWith(applicationData.registrationAddressId)
                expect(documentsServiceMock.getInternalPassportWithRegistration).toHaveBeenCalledWith(user, true)
                expect(documentsServiceMock.getIdentityDocument).toHaveBeenCalledWith(user)
                expect(criminalRecordCertificateMapperMock.toProviderRequest).toHaveBeenCalledWith(expectedRequestData)
                expect(criminalRecordCertificateProviderMock.sendApplication).toHaveBeenCalledWith({
                    ...providerRequest,
                    signature,
                })
                expect(criminalRecordCertificateModel.create).toHaveBeenCalledWith({
                    userIdentifier,
                    mobileUid,
                    applicationId,
                    reason: {
                        code: actualRequestData.reasonId,
                        name: criminalRecordCertificateProviderMock.reasons.get(actualRequestData.reasonId),
                    },
                    type: actualRequestData.certificateType,
                    sendingRequestTime: new Date(),
                    receivingApplicationTime: new Date(),
                    isDownloadAction: false,
                    isViewAction: false,
                    applicant: {
                        applicantIdentifier: userIdentifier,
                        applicantMobileUid: mobileUid,
                        nationality: actualRequestData.nationalitiesAlfa3,
                    },
                    publicService: undefined,
                    status,
                    statusHistory: [{ status, date: new Date() }],
                    notifications: {},
                })
                expect(notificationServiceMock.createNotificationWithPushesByMobileUid).toHaveBeenCalledWith({
                    templateCode: MessageTemplateCode.CriminalRecordCertificateApplicationDone,
                    userIdentifier,
                    mobileUid,
                    resourceId: applicationId,
                })
                expect(analyticsServiceMock.notifyRate).toHaveBeenCalledWith({
                    userIdentifier,
                    category: RatingCategory.PublicService,
                    serviceCode: 'criminal-cert',
                    resourceId: applicationId,
                })
            },
        )

        it(`should try to send criminal certificate application when send process is more than one in progress`, async () => {
            jest.spyOn(criminalRecordCertificateModel, 'countDocuments').mockResolvedValueOnce(0)
            jest.spyOn(addressServiceMock, 'getPublicServiceAddress').mockResolvedValueOnce(registrationAddress)
            jest.spyOn(documentsServiceMock, 'getInternalPassportWithRegistration').mockResolvedValueOnce(
                <GetInternalPassportWithRegistrationResponse>{},
            )
            jest.spyOn(documentsServiceMock, 'getIdentityDocument').mockResolvedValueOnce({
                identityType: IdentityDocumentType.InternalPassport,
                internalPassport: <InternalPassport>testKit.docs.generateDocument(IdentityDocumentType.InternalPassport),
            })
            jest.spyOn(criminalRecordCertificateMapperMock, 'toProviderRequest').mockReturnValueOnce(providerRequest)
            jest.spyOn(cryptoDocServiceClient, 'docGenerateSignature').mockResolvedValueOnce({ signature })
            jest.spyOn(criminalRecordCertificateProviderMock, 'sendApplication').mockResolvedValueOnce({
                id: sentApplicationId,
                status: CriminalRecordCertOrderStatus.MoreThanOneInProgress,
            })

            expect(await criminalRecordCertificateService.sendApplication(user, headers, applicationData)).toEqual({
                processCode: ProcessCode.CriminalRecordCertificateMoreThenOneInProgress,
            })

            expect(criminalRecordCertificateModel.countDocuments).toHaveBeenCalledWith({
                userIdentifier,
                status: CriminalRecordCertificateStatus.applicationProcessing,
            })
            expect(addressServiceMock.getPublicServiceAddress).toHaveBeenCalledWith(applicationData.registrationAddressId)
            expect(documentsServiceMock.getInternalPassportWithRegistration).toHaveBeenCalledWith(user, true)
            expect(documentsServiceMock.getIdentityDocument).toHaveBeenCalledWith(user)
            expect(criminalRecordCertificateMapperMock.toProviderRequest).toHaveBeenCalledWith(requestData)
            expect(criminalRecordCertificateProviderMock.sendApplication).toHaveBeenCalledWith({
                ...providerRequest,
                signature,
            })
        })

        it(`should fail in case residence is not able to fetch identity`, async () => {
            const rejectedError = new Error('Unexpected error')

            jest.spyOn(criminalRecordCertificateModel, 'countDocuments').mockResolvedValueOnce(0)
            jest.spyOn(addressServiceMock, 'getPublicServiceAddress').mockResolvedValueOnce(registrationAddress)
            jest.spyOn(documentsServiceMock, 'getInternalPassportWithRegistration').mockResolvedValueOnce(
                <GetInternalPassportWithRegistrationResponse>{},
            )
            jest.spyOn(documentsServiceMock, 'getIdentityDocument').mockRejectedValueOnce(rejectedError)

            await expect(async () => {
                await criminalRecordCertificateService.sendApplication(user, headers, applicationData)
            }).rejects.toEqual(
                new ServiceUnavailableError('Registry unavailable', ProcessCode.CriminalRecordCertificateSomeRegistryUnavailable),
            )

            expect(criminalRecordCertificateModel.countDocuments).toHaveBeenCalledWith({
                userIdentifier,
                status: CriminalRecordCertificateStatus.applicationProcessing,
            })
            expect(addressServiceMock.getPublicServiceAddress).toHaveBeenCalledWith(applicationData.registrationAddressId)
            expect(documentsServiceMock.getInternalPassportWithRegistration).toHaveBeenCalledWith(user, true)
            expect(documentsServiceMock.getIdentityDocument).toHaveBeenCalledWith(user)
            expect(loggerMock.info).toHaveBeenCalledWith('Failed to get user identity document', { err: rejectedError })
        })

        it('should fail in case processing application exists', async () => {
            jest.spyOn(criminalRecordCertificateModel, 'countDocuments').mockResolvedValueOnce(1)

            await expect(async () => {
                await criminalRecordCertificateService.sendApplication(user, headers, applicationData)
            }).rejects.toEqual(new BadRequestError('', {}, ProcessCode.CriminalRecordCertificateMoreThenOneInProgress))

            expect(criminalRecordCertificateModel.countDocuments).toHaveBeenCalledWith({
                userIdentifier,
                status: CriminalRecordCertificateStatus.applicationProcessing,
            })
        })
    })

    describe('method `sendApplicationConfirmation`', () => {
        it('should successfully send application confirmation', async () => {
            const { phoneNumber, email, fName, lName, mName, birthDay, itn, gender } = user
            const applicationData = {
                nationalities: [],
                phoneNumber,
                email,
                reasonId: '5',
                certificateType: CriminalRecordCertificateType.full,
                registrationAddressId: randomUUID(),
                birthPlace: {
                    city: 'City',
                    country: 'Country',
                },
            }
            const registrationAddress = {
                address: {},
            }
            const applicationConfirmationResponse = {
                title: 'Запит про надання витягу про несудимість',
                attentionMessage: {
                    icon: '☝️',
                    text: 'Уважно перевірте введені дані перед тим як замовити витяг.',
                    parameters: [],
                },
                applicant: {
                    title: 'Дані про заявника',
                    fullName: {
                        label: 'ПІБ:',
                        value: [lName, fName, mName].join(' '),
                    },
                    previousLastName: undefined,
                    previousFirstName: undefined,
                    previousMiddleName: undefined,
                    gender: {
                        label: 'Стать:',
                        value: gender,
                    },
                    nationality: {
                        label: 'Громадянство:',
                        value: 'Україна',
                    },
                    birthDate: {
                        label: 'Дата народження:',
                        value: birthDay,
                    },
                    birthPlace: {
                        label: 'Місце народження:',
                        value: 'Україна',
                    },
                    registrationAddress: {
                        label: 'Місце реєстрації проживання:',
                        value: 'Україна',
                    },
                },
                contacts: {
                    title: 'Контактні дані',
                    phoneNumber: {
                        label: 'Номер телефону:',
                        value: phoneNumber,
                    },
                    email: {
                        label: 'Email:',
                        value: email,
                    },
                },
                certificateType: {
                    title: 'Тип витягу',
                    type: applicationData.certificateType,
                },
                reason: {
                    title: 'Мета запиту',
                    reason: String(criminalRecordCertificateProviderMock.reasons.get(applicationData.reasonId)),
                },
                checkboxName: 'Підтверджую достовірність наведених у заяві даних',
            }
            const requestData = {
                itn,
                reasonId: '5',
                certificateType: CriminalRecordCertOrderType.Full.toLowerCase(),
                firstName: fName,
                lastName: lName,
                middleName: mName,
                previousFirstName: undefined,
                previousLastName: undefined,
                previousMiddleName: undefined,
                gender: gender.toLowerCase(),
                birthDate: birthDay,
                birthCountry: 'Country',
                birthCity: 'City',
                registrationCountry: undefined,
                registrationRegion: undefined,
                registrationDistrict: undefined,
                registrationCity: undefined,
                nationalities: ['Україна'],
                nationalitiesAlfa3: ['UKR'],
                email,
                phoneNumber,
            }
            const reasonLabel = 'Оформлення на роботу'
            const certificateTypeDescription =
                'Притягнення до кримінальної відповідальності; наявність чи відсутність судимості; обмеження, передбачені кримінально-процесуальним законодавством'

            jest.spyOn(addressServiceMock, 'getPublicServiceAddress').mockResolvedValueOnce(registrationAddress)
            jest.spyOn(documentsServiceMock, 'getInternalPassportWithRegistration').mockResolvedValueOnce(<
                GetInternalPassportWithRegistrationResponse
            >{ passport: {} })
            jest.spyOn(criminalRecordCertificateMapperMock, 'toApplicationConfirmationResponse').mockReturnValueOnce(
                applicationConfirmationResponse,
            )

            const result = await criminalRecordCertificateService.sendApplicationConfirmation(user, applicationData)

            expect(result).toEqual({ application: applicationConfirmationResponse })

            expect(addressServiceMock.getPublicServiceAddress).toHaveBeenCalledWith(applicationData.registrationAddressId)
            expect(documentsServiceMock.getInternalPassportWithRegistration).toHaveBeenCalledWith(user, true)
            expect(criminalRecordCertificateMapperMock.toApplicationConfirmationResponse).toHaveBeenCalledWith(
                requestData,
                reasonLabel,
                certificateTypeDescription,
            )
        })
    })
})
