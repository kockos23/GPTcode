import {describe,expect,it} from 'vitest'
import {parseTaskCommand} from '../../convex/taskCommandLogic'

const NOW=Date.UTC(2026,10,19,12)
describe('NORA task command parsing',()=>{
  it('extracts a clean title and tomorrow deadline',()=>{expect(parseTaskCommand('pridaj mi na zajtra úlohu vybrať vhodné 4 písmenové domény na registráciu',NOW)).toEqual({title:'Vybrať vhodné 4 písmenové domény na registráciu',deadline:'2026-11-20',priority:'P2',original:'pridaj mi na zajtra úlohu vybrať vhodné 4 písmenové domény na registráciu'})})
  it('detects importance and explicit Slovak date',()=>{const task=parseTaskCommand('Vytvor mi dôležitú úlohu 23. 11. 2026: zavolať dodávateľovi',NOW);expect(task.priority).toBe('P1');expect(task.deadline).toBe('2026-11-23');expect(task.title).toContain('Zavolať dodávateľovi')})
  it('maps later work to P3 and next weekday',()=>{const task=parseTaskCommand('Pridaj mi na piatok úlohu neskôr prečítať report',NOW);expect(task.priority).toBe('P3');expect(task.deadline).toBe('2026-11-20');expect(task.title).toBe('Prečítať report')})
})
