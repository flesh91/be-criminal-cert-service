const clientCallOptions = jest.fn()

jest.mock('@diia-inhouse/diia-app', () => ({
    ...jest.requireActual('@diia-inhouse/diia-app'),
    clientCallOptions,
}))

import { GrpcClientFactory } from '@diia-inhouse/diia-app'

import TestKit, { mockInstance } from '@diia-inhouse/test'
import { ActionVersion } from '@diia-inhouse/types'

import UserService from '@services/user'

import { userServiceClient } from '@tests/mocks/grpc/clients'

import { AppConfig } from '@interfaces/config'

describe('UserService', () => {
    const testKit = new TestKit()
    const config = <AppConfig>{
        app: {
            dateFormat: 'DD.MM.YYYY',
        },
        grpc: {
            userServiceAddress: 'user.service.address.ua',
        },
    }
    const grpcClientFactoryMock = mockInstance(GrpcClientFactory)

    jest.spyOn(grpcClientFactoryMock, 'createGrpcClient').mockReturnValueOnce(userServiceClient)

    const userService = new UserService(grpcClientFactoryMock, config)

    describe('method `getUserDocuments`', () => {
        it('should successfully get user documents', async () => {
            const {
                user: { identifier: userIdentifier },
            } = testKit.session.getUserSession()
            const userDocuments = {
                documents: [],
            }

            clientCallOptions.mockReturnValueOnce({})
            jest.spyOn(userServiceClient, 'getUserDocuments').mockResolvedValueOnce(userDocuments)

            expect(await userService.getUserDocuments(userIdentifier, [])).toEqual(userDocuments)

            expect(clientCallOptions).toHaveBeenCalledWith({ version: ActionVersion.V2 })
            expect(userServiceClient.getUserDocuments).toHaveBeenCalledWith({ userIdentifier, filters: [] }, {})
        })
    })
})
