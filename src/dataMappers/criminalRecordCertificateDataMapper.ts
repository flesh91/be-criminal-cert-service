import moment from 'moment'

import { AttentionMessage, Gender } from '@diia-inhouse/types'
import { utils } from '@diia-inhouse/utils'

import {
    CriminalRecordCertificateApplicationConfirmationApplication,
    CriminalRecordCertificateApplicationDetails,
    CriminalRecordCertificateApplicationLoadActionType,
    CriminalRecordCertificateItem,
    CriminalRecordCertificateStatus,
    CriminalRecordCertificateStatusFilterInfo,
    CriminalRecordCertificateType,
} from '@src/generated'

import AssetsService from '@services/assets'

import { AppConfig } from '@interfaces/config'
import { CriminalRecordCertificateModel } from '@interfaces/models/criminalRecordCertificate'
import {
    CriminalRecordCertOrderGender,
    CriminalRecordCertOrderRequest,
    CriminalRecordCertOrderType,
} from '@interfaces/providers/criminalRecordCertificate'
import { Icon } from '@interfaces/services/assets'
import { CriminalRecordCertificateApplicationRequestData } from '@interfaces/services/criminalRecordCertificate'

export default class CriminalRecordCertificateMapper {
    constructor(
        private readonly assetsService: AssetsService,
        private readonly config: AppConfig,
    ) {}

    readonly providerDateFormat = 'YYYY-MM-DD'

    readonly noCertificatesByStatusMessage: Partial<Record<CriminalRecordCertificateStatus, AttentionMessage>> = {
        [CriminalRecordCertificateStatus.applicationProcessing]: {
            icon: '🤷‍♂️️',
            text: 'Ой, тут порожньо. Перевірте в розділі Готові або замовте нові витяги.',
            parameters: [],
        },
        [CriminalRecordCertificateStatus.done]: {
            icon: '🤷‍♂️',
            text: 'Наразі немає готових витягів. \nМи повідомимо, коли замовлені витяги будуть готові.',
            parameters: [],
        },
    }

    readonly processingApplicationExistsMessage: AttentionMessage = {
        icon: '😞',
        text: 'Наразі послуга недоступна.\nБудь ласка, дочекайтесь завершення обробки попереднього запиту та замовте новий витяг.',
        parameters: [],
    }

    private readonly statusMessageByStatus: Partial<Record<CriminalRecordCertificateStatus, AttentionMessage>> = {
        [CriminalRecordCertificateStatus.applicationProcessing]: {
            title: 'Запит полетів в обробку',
            text: 'Більшість запитів опрацьовуються автоматично, а підготовка витягу триває кілька хвилин. Проте часом дані потребують додаткової перевірки. Тоді витяг готують вручну. Зазвичай це триває до 10 днів, інколи — до 30 календарних днів. Будь ласка, очікуйте на сповіщення про результат.',
            icon: '⏳',
            parameters: [],
        },
        [CriminalRecordCertificateStatus.done]: {
            title: 'Витяг готовий',
            text: 'Ви можете завантажити його за посиланням нижче.',
            icon: '✅',
            parameters: [],
        },
    }

    readonly applicationStartMessage: string =
        'Щоб отримати витяг про несудимість, потрібно вказати: \n\n• тип та мету запиту; \n• місце народження; \n• контактні дані. \n\nЯкщо з даними все гаразд, ви отримаєте витяг протягом 10 робочих днів. Якщо вони потребують додаткової перевірки — протягом 30 календарних днів.'

    readonly missingTaxpayerCardAttentionMessage: AttentionMessage = {
        icon: '😞',
        text: 'Неможливо отримати витяг про несудимість. Ваш РНОКПП не пройшов перевірку податковою.',
        parameters: [],
    }

    readonly confirmingTaxpayerCardAttentionMessage: AttentionMessage = {
        icon: '😞',
        text: 'Ваш РНОКПП ще перевіряється податковою. Спробуйте, будь ласка, пізніше.',
        parameters: [],
    }

    readonly unsuitableAgeAttentionMessage: AttentionMessage = {
        icon: '😞',
        text: 'Неможливо отримати витяг про несудимість. Вам ще не виповнилося 14 років.',
        parameters: [],
    }

    readonly serviceIsNotActiveAttentionMessage: AttentionMessage = {
        icon: '😞',
        text: 'На жаль, послуга тимчасово недоступна',
        parameters: [],
    }

    readonly userGenderToFullGenderName: Record<Gender, string> = {
        [Gender.male]: 'Чоловік',
        [Gender.female]: 'Жінка',
    }

    readonly userGenderToProviderCertOrderGender: Record<Gender, CriminalRecordCertOrderGender> = {
        [Gender.male]: CriminalRecordCertOrderGender.Male,
        [Gender.female]: CriminalRecordCertOrderGender.Female,
    }

    readonly certificateStatusToNamePlural: Partial<Record<CriminalRecordCertificateStatus, string>> = {
        [CriminalRecordCertificateStatus.applicationProcessing]: 'Замовлені',
        [CriminalRecordCertificateStatus.done]: 'Готові',
    }

    readonly typeCodeToName: Record<CriminalRecordCertificateType, string> = {
        [CriminalRecordCertificateType.short]: 'Тип: короткий',
        [CriminalRecordCertificateType.full]: 'Тип: повний',
    }

    readonly typeCodeToProviderCertOrderType: Record<CriminalRecordCertificateType, CriminalRecordCertOrderType> = {
        [CriminalRecordCertificateType.short]: CriminalRecordCertOrderType.Short,
        [CriminalRecordCertificateType.full]: CriminalRecordCertOrderType.Full,
    }

    toApplicationDetails(certificate: CriminalRecordCertificateModel): CriminalRecordCertificateApplicationDetails {
        const { status } = certificate

        const title = 'Запит на витяг про несудимість'
        const statusMessage = this.statusMessageByStatus[status]

        if (status !== CriminalRecordCertificateStatus.done) {
            return {
                title,
                statusMessage,
                status,
                loadActions: [],
            }
        }

        const loadActions = [
            {
                type: CriminalRecordCertificateApplicationLoadActionType.downloadArchive,
                icon: this.assetsService.getIcon(Icon.Download),
                name: 'Завантажити архів',
            },
            {
                type: CriminalRecordCertificateApplicationLoadActionType.viewPdf,
                icon: this.assetsService.getIcon(Icon.View),
                name: 'Переглянути витяг',
            },
        ]

        return {
            title,
            statusMessage,
            status,
            loadActions,
        }
    }

    toStatusFilterInfo(status: CriminalRecordCertificateStatus): CriminalRecordCertificateStatusFilterInfo {
        return {
            code: status,
            name: this.certificateStatusToNamePlural[status]!,
        }
    }

    toResponseItem(certificate: CriminalRecordCertificateModel): CriminalRecordCertificateItem {
        const { applicationId, status, reason, createdAt, type } = certificate

        return {
            applicationId,
            status,
            reason: reason!.name,
            creationDate: `від ${moment(createdAt).format(this.config.app.dateFormat)}`,
            type: this.typeCodeToName[type!],
        }
    }

    toApplicationConfirmationResponse(
        requestData: CriminalRecordCertificateApplicationRequestData,
        reasonLabel: string,
        certificateTypeDescription?: string,
    ): CriminalRecordCertificateApplicationConfirmationApplication {
        const {
            lastName,
            firstName,
            middleName,
            nationalities,
            previousLastName,
            previousFirstName,
            previousMiddleName,
            birthDate,
            gender,
            birthCountry,
            birthCity,
            registrationCountry,
            registrationRegion,
            registrationDistrict,
            registrationCity,
            phoneNumber,
            email,
        } = requestData

        const fullName = utils.getFullName(lastName, firstName, middleName)

        return {
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
                    value: fullName,
                },
                previousLastName: previousLastName
                    ? {
                          label: 'Попередні прізвища:',
                          value: previousLastName.replaceAll(/\s*,\s*/g, '\n'),
                      }
                    : undefined,
                previousFirstName: previousFirstName
                    ? {
                          label: 'Попередні імена:',
                          value: previousFirstName.replaceAll(/\s*,\s*/g, '\n'),
                      }
                    : undefined,
                previousMiddleName: previousMiddleName
                    ? {
                          label: 'Попередні по батькові:',
                          value: previousMiddleName.replaceAll(/\s*,\s*/g, '\n'),
                      }
                    : undefined,
                gender: {
                    label: 'Стать:',
                    value: this.userGenderToFullGenderName[gender],
                },
                nationality: {
                    label: 'Громадянство:',
                    value: nationalities.join('\n'),
                },
                birthDate: {
                    label: 'Дата народження:',
                    value: birthDate,
                },
                birthPlace: {
                    label: 'Місце народження:',
                    value: [birthCountry, birthCity].filter(Boolean).join(', '),
                },
                registrationAddress: {
                    label: 'Місце реєстрації проживання:',
                    value: [registrationCountry, registrationRegion, registrationDistrict, registrationCity].filter(Boolean).join(', '),
                },
            },
            contacts: {
                title: 'Контактні дані',
                phoneNumber: {
                    label: 'Номер телефону:',
                    value: phoneNumber,
                },
                email: email
                    ? {
                          label: 'Email:',
                          value: email,
                      }
                    : undefined,
            },
            certificateType: {
                title: 'Тип витягу',
                type: certificateTypeDescription || '',
            },
            reason: {
                title: 'Мета запиту',
                reason: reasonLabel,
            },
            checkboxName: 'Підтверджую достовірність наведених у заяві даних',
        }
    }

    toProviderRequest(requestData: CriminalRecordCertificateApplicationRequestData): CriminalRecordCertOrderRequest {
        const {
            firstName,
            lastName,
            middleName,
            previousFirstName,
            previousLastName,
            previousMiddleName,
            gender: userGender,
            birthDate: userBirthDate,
            birthCountry,
            birthRegion,
            birthDistrict,
            birthCity,
            registrationCountry,
            registrationRegion,
            registrationDistrict,
            registrationCity,
            nationalities,
            phoneNumber: phone,
            certificateType,
            reasonId: purpose,
            itn: clientId,
        } = requestData

        const firstNameChanged = Boolean(previousFirstName)
        const lastNameChanged = Boolean(previousLastName)
        const middleNameChanged = Boolean(previousMiddleName)
        const firstNameBefore = firstNameChanged && previousFirstName ? previousFirstName.replaceAll(/\s*,\s*/g, ', ') : undefined
        const lastNameBefore = lastNameChanged && previousLastName ? previousLastName.replaceAll(/\s*,\s*/g, ', ') : undefined
        const middleNameBefore = middleNameChanged && previousMiddleName ? previousMiddleName.replaceAll(/\s*,\s*/g, ', ') : undefined

        const gender = this.userGenderToProviderCertOrderGender[userGender]
        const birthDate = moment(userBirthDate, this.config.app.dateFormat).format(this.providerDateFormat)
        const nationality = nationalities.join(',')
        const type = this.typeCodeToProviderCertOrderType[certificateType!]

        return {
            firstName,
            lastName,
            middleName,
            firstNameChanged,
            lastNameChanged,
            middleNameChanged,
            firstNameBefore,
            lastNameBefore,
            middleNameBefore,
            gender,
            birthDate,
            birthCountry: birthCountry!,
            birthRegion,
            birthDistrict,
            birthCity: birthCity!,
            registrationCountry: registrationCountry!,
            registrationRegion,
            registrationDistrict,
            registrationCity: registrationCity!,
            nationality,
            phone,
            type,
            purpose: purpose!,
            clientId,
        }
    }
}
