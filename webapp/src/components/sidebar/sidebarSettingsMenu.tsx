// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import React, {useState} from 'react'
import {FormattedMessage, useIntl, IntlShape} from 'react-intl'

import {Archiver} from '../../archiver'
import {
    darkTheme,
    darkThemeName,
    defaultTheme,
    defaultThemeName,
    lightTheme,
    lightThemeName,
    setTheme, systemThemeName,
    Theme,
} from '../../theme'
import Menu from '../../widgets/menu'
import MenuWrapper from '../../widgets/menuWrapper'
import {useAppDispatch, useAppSelector} from '../../store/hooks'
import {storeLanguage} from '../../store/language'
import {getCurrentTeam, Team} from '../../store/teams'
import mutator from '../../mutator'
import {UserSettings} from '../../userSettings'

import './sidebarSettingsMenu.scss'
import CheckIcon from '../../widgets/icons/check'
import {Constants} from '../../constants'

import TelemetryClient, {TelemetryCategory, TelemetryActions} from '../../telemetry/telemetryClient'
import {sendFlashMessage} from '../flashMessages'
import { Utils } from '../../utils'
import {Board} from '../../blocks/board'
import {createCard, Card} from '../../blocks/card'
import {CsvImporter, ProjectTaskData} from '../../csvImporter'
import { DateProperty } from '../../properties/date/date'
import {BlockIcons} from '../../blockIcons'


type Props = {
    activeTheme: string,
    boards?: Board[],
}

const SidebarSettingsMenu = (props: Props) => {
    const intl = useIntl()
    const dispatch = useAppDispatch()
    const currentTeam = useAppSelector<Team|null>(getCurrentTeam)

    // we need this as the sidebar doesn't always need to re-render
    // on theme change. This can cause props and the actual
    // active theme can go out of sync
    const [themeName, setThemeName] = useState(props.activeTheme)

    const updateTheme = (theme: Theme | null, name: string) => {
        setTheme(theme)
        setThemeName(name)
    }

    const [randomIcons, setRandomIcons] = useState(UserSettings.prefillRandomIcons)
    const toggleRandomIcons = () => {
        UserSettings.prefillRandomIcons = !UserSettings.prefillRandomIcons
        setRandomIcons(!randomIcons)
    }

    const themes = [
        {
            id: defaultThemeName,
            displayName: 'Default theme',
            theme: defaultTheme,
        },
        {
            id: darkThemeName,
            displayName: 'Dark theme',
            theme: darkTheme,
        },
        {
            id: lightThemeName,
            displayName: 'Light theme',
            theme: lightTheme,
        },
        {
            id: systemThemeName,
            displayName: 'System theme',
            theme: null,
        },
    ]

    return (
        <div className='SidebarSettingsMenu'>
            <MenuWrapper>
                <div className='menu-entry'>
                    <FormattedMessage
                        id='Sidebar.settings'
                        defaultMessage='Settings'
                    />
                </div>
                <Menu position='top'>
                    <Menu.SubMenu
                        id='import'
                        name={intl.formatMessage({id: 'Sidebar.import', defaultMessage: 'Import'})}
                        position='top'
                    >
                        <Menu.Text
                            id='import_archive'
                            name={intl.formatMessage({id: 'Sidebar.import-archive', defaultMessage: 'Import archive'})}
                            onClick={async () => {
                                TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.ImportArchive)
                                Archiver.importFullArchive()
                            }}
                        />

                        <Menu.Text
                            id='import_csv'
                            name={intl.formatMessage({id: 'Sidebar.import-csv', defaultMessage: 'Import csv'})}
                            onClick={async () => {
                                onImportCsvTrigger(props.boards || [], intl)
                                // TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.ImportCSV)
                                // Archiver.importCSV()
                            }}
                        />
                        {
                            Constants.imports.map((i) => (
                                <Menu.Text
                                    key={`${i.id}-import`}
                                    id={`${i.id}-import`}
                                    name={i.displayName}
                                    onClick={() => {
                                        TelemetryClient.trackEvent(TelemetryCategory, i.telemetryName)
                                        window.open(i.href)
                                    }}
                                />
                            ))
                        }
                    </Menu.SubMenu>
                    <Menu.Text
                        id='export'
                        name={intl.formatMessage({id: 'Sidebar.export-archive', defaultMessage: 'Export archive'})}
                        onClick={async () => {
                            if (currentTeam) {
                                TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.ExportArchive)
                                Archiver.exportFullArchive(currentTeam.id)
                            }
                        }}
                    />
                    <Menu.SubMenu
                        id='lang'
                        name={intl.formatMessage({id: 'Sidebar.set-language', defaultMessage: 'Set language'})}
                        position='top'
                    >
                        {
                            Constants.languages.map((language) => (
                                <Menu.Text
                                    key={language.code}
                                    id={`${language.name}-lang`}
                                    name={language.displayName}
                                    onClick={async () => dispatch(storeLanguage(language.code))}
                                    rightIcon={intl.locale.toLowerCase() === language.code ? <CheckIcon/> : null}
                                />
                            ))
                        }
                    </Menu.SubMenu>
                    <Menu.SubMenu
                        id='theme'
                        name={intl.formatMessage({id: 'Sidebar.set-theme', defaultMessage: 'Set theme'})}
                        position='top'
                    >
                        {
                            themes.map((theme) =>
                                (
                                    <Menu.Text
                                        key={theme.id}
                                        id={theme.id}
                                        name={intl.formatMessage({id: `Sidebar.${theme.id}`, defaultMessage: theme.displayName})}
                                        onClick={async () => updateTheme(theme.theme, theme.id)}
                                        rightIcon={themeName === theme.id ? <CheckIcon/> : null}
                                    />
                                ),
                            )
                        }
                    </Menu.SubMenu>
                    <Menu.Switch
                        id='random-icons'
                        name={intl.formatMessage({id: 'Sidebar.random-icons', defaultMessage: 'Random icons'})}
                        isOn={randomIcons}
                        onClick={async () => toggleRandomIcons()}
                        suppressItemClicked={true}
                    />
                </Menu>
            </MenuWrapper>
        </div>
    )
}

const timeZoneOffset = (date: number): number => {
    return new Date(date).getTimezoneOffset() * 60 * 1000
}

function createDatePropertyFromCalendarDate(start: Date): DateProperty {
    // save as noon local, expected from the date picker
    // 校验 start 类型
    if (!(start instanceof Date)) {
        // 转为 Date
        start = new Date(start)
    }

    start.setHours(12)
    const dateFrom = start.getTime() - timeZoneOffset(start.getTime())

    const dateProperty: DateProperty = {from: dateFrom}
    return dateProperty
}

function onImportCsvTrigger(
    // board: Board, activeView: BoardView, cards: Card[], 
    boards: Board[],
    intl: IntlShape
) {
    try {

        // 打印 boards id + title
        console.log({boards})

        // 读取 CSV 文件内容
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.csv'
        input.onchange = async () => {
            // 读取文件
            const file = input.files && input.files[0]
            if (!file) {
                return
            }

            // 读取 csv 表内容并打印
            const csvImporter = new CsvImporter<ProjectTaskData>({
                header: true,
                delimiter: ',',
                skipEmptyLines: true,
                trimFields: true,
                autoDetectEncoding: true
            })
            const csvData = await csvImporter.readFile(file)
            // 打印编码
            console.log(`Detected encoding: ${csvData.encoding}`)

            // 按 Board 分组
            const TaskMap: {[key: string]: ProjectTaskData[]} = {}
            for (const board of boards) {
                TaskMap[board.title.trim()] = []
            }
            csvData.data.forEach((task) => {
                console.log(task["Board"], task["Name"], task["Status"], task["Due Date"], task["Estimated Hours"])

                const boardName = task["Board"].trim()
                // 如果 TaskMap 没有 boardName, 则初始化为空数组
                if (!TaskMap[boardName]) {
                    TaskMap[boardName] = []
                }
                TaskMap[boardName].push(task)
            })

            // 按 Board 分组生成 Block
            for (const title of Object.keys(TaskMap)) {
                const importingMessage = intl.formatMessage({
                    id: 'ViewHeader.importing',
                    defaultMessage: `Importing tasks added to board ${title} ...`,
                })
                sendFlashMessage({content: importingMessage, severity: 'normal'})


                // 根据 title 获取 board
                const board = boards.find((o) => o.title.trim() === title)
                if (!board) {
                    console.log(`Board ${title} not found`)
                    continue
                }
                const boardId = board.id

                // 查找所有属性的 id
                const statusProperty = board.cardProperties.find((o) => o.name === 'Status')
                const statusId = statusProperty?.id

                const priorityProperty = board.cardProperties.find((o) => o.name === 'Priority')
                const priorityId = priorityProperty?.id
                const dueDateId = board.cardProperties.find((o) => o.name === 'Due Date')?.id
                const estimatedHoursId = board.cardProperties.find((o) => o.name === 'Estimated Hours')?.id

                // 查找状态的 id
                const statusNotStartedId = statusProperty?.options.find((o) => o.value === 'Not Started')?.id

                // 查找三种优先级的 id
                const priorityLowId = priorityProperty?.options.find((o) => o.value.includes('Low'))?.id
                const priorityMediumId = priorityProperty?.options.find((o) => o.value.includes('Medium'))?.id
                const priorityHighId = priorityProperty?.options.find((o) => o.value.includes('High'))?.id

                // 以上属性必须有值
                if (!statusId || !priorityId || !dueDateId || !estimatedHoursId || !statusNotStartedId || !priorityLowId || !priorityMediumId || !priorityHighId) {
                    console.log(`Board ${title} missing properties`)
                    continue
                }

                const tasks = TaskMap[title]
                const blocksToInsert: Card[] = []
                for (const task of tasks) {
                    // 初始化新卡
                    const card = createCard()

                    // 记录日志
                    TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.CreateCard, {board: boardId, card: card.id})

                    card.parentId = boardId
                    card.boardId = boardId

                    // 任务内容
                    card.title = task["Name"].trim()
                    // 随机图标
                    card.fields.icon = BlockIcons.shared.randomIcon()

                    // 添加状态
                    const properties: Record<string, string> = {}
                    properties[statusId] = statusNotStartedId
                    // 添加优先级
                    if (task["Priority"].trim().toLowerCase().includes('low')) {
                        properties[priorityId] = priorityLowId
                    } else if (task["Priority"].trim().toLowerCase().includes('medium')) {
                        properties[priorityId] = priorityMediumId
                    } else if (task["Priority"].trim().toLowerCase().includes('high')) {
                        properties[priorityId] = priorityHighId
                    }
                    // 添加 Due Date + Estimated hours
                    properties[dueDateId] = JSON.stringify(createDatePropertyFromCalendarDate(task["Due Date"]))
                    properties[estimatedHoursId] = String(task["Estimated Hours"])
                    card.fields.properties = properties

                    // 添加到 board
                    blocksToInsert.push(card)
                }

                await mutator.insertBlocks(boardId, blocksToInsert, 'import tasks')

                const importCompleteMessage = intl.formatMessage({
                    id: 'ViewHeader.import-complete',
                    defaultMessage: `Import complete! ${blocksToInsert.length} tasks added to board ${title}`,
                })
                sendFlashMessage({content: importCompleteMessage, severity: 'normal'})
            }

            const importAllDoneMessage = intl.formatMessage({
                id: 'ViewHeader.import-all-complete',
                defaultMessage: `Import done!`,
            })
            sendFlashMessage({content: importAllDoneMessage, severity: 'normal'})

        }

        input.style.display = 'none'
        document.body.appendChild(input)
        input.click()

        
    } catch (e) {
        Utils.logError(`ImportCSV ERROR: ${e}`)
        const importFailedMessage = intl.formatMessage({
            id: 'ViewHeader.import-failed',
            defaultMessage: 'Import failed!',
        })
        sendFlashMessage({content: importFailedMessage, severity: 'high'})
    }
}

export default React.memo(SidebarSettingsMenu)
