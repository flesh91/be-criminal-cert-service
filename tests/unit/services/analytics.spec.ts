import { GrpcClientFactory } from '@diia-inhouse/diia-app'

import { RatingCategory } from '@diia-inhouse/analytics'
import DiiaLogger from '@diia-inhouse/diia-logger'
import { EventBus } from '@diia-inhouse/diia-queue'
import { ServiceUnavailableError } from '@diia-inhouse/errors'
import TestKit, { mockInstance } from '@diia-inhouse/test'

import AnalyticsService from '@services/analytics'

import { analyticsServiceClient } from '@tests/mocks/grpc/clients'

import { AppConfig } from '@interfaces/config'
import { InternalEvent } from '@interfaces/queue'

describe('AnalyticsService', () => {
    const testKit = new TestKit()
    const grpcClientFactoryMock = mockInstance(GrpcClientFactory)

    jest.spyOn(grpcClientFactoryMock, 'createGrpcClient').mockReturnValueOnce(analyticsServiceClient)

    const config = <AppConfig>{
        grpc: {
            analyticsServiceAddress: 'analytics.service.address.com',
        },
    }
    const eventBusMock = mockInstance(EventBus)
    const loggerMock = mockInstance(DiiaLogger)

    const analyticsService = new AnalyticsService(grpcClientFactoryMock, config, eventBusMock, loggerMock)

    const {
        user: { identifier: userIdentifier },
    } = testKit.session.getUserSession()

    describe('method `getRatingForm`', () => {
        it('should successfully get rating form', async () => {
            const expectedResult = {
                ratingStartsAtUnixTime: Date.now(),
            }
            const params = {
                userIdentifier,
                category: 'category',
                serviceCode: 'service-code',
                statusDate: new Date(),
            }

            jest.spyOn(analyticsServiceClient, 'getRatingForm').mockResolvedValueOnce(expectedResult)

            expect(await analyticsService.getRatingForm(params)).toEqual(expectedResult)

            expect(analyticsServiceClient.getRatingForm).toHaveBeenCalledWith(params, expect.any(Object))
        })
    })

    describe('method `notifyRate`', () => {
        const payload = {
            userIdentifier,
            category: RatingCategory.Document,
            serviceCode: 'criminal-cert',
        }

        it('should successfully notify rate', async () => {
            jest.spyOn(eventBusMock, 'publish').mockResolvedValueOnce(true)

            await analyticsService.notifyRate(payload)

            expect(eventBusMock.publish).toHaveBeenCalledWith(InternalEvent.RateService, payload)
        })

        it('should just record error message into log in case of any error', async () => {
            const rejectedError = new ServiceUnavailableError()

            jest.spyOn(eventBusMock, 'publish').mockRejectedValueOnce(rejectedError)

            await analyticsService.notifyRate(payload)

            expect(eventBusMock.publish).toHaveBeenCalledWith(InternalEvent.RateService, payload)
            expect(loggerMock.error).toHaveBeenCalledWith('Failed to publish rate service', { err: rejectedError })
        })
    })
})
